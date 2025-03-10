#!/usr/bin/env pwsh

param (
    [string]$n,
    [string]$namespace = "synthgen",
    [string]$r,
    [string]$release = "synthgen",
    [string]$f,
    [string]$values = "",
    [int]$timeout = 300,  # Default timeout in seconds for waiting for pods
    [switch]$wait
)

# Function to log the current step with clear formatting
function Log-Step {
    param (
        [int]$StepNumber,
        [string]$StepDescription
    )
    
    Write-Host "`n[STEP $StepNumber] $StepDescription" -ForegroundColor Magenta
    Write-Host "=========================================================" -ForegroundColor Magenta
}

# Function to check if a command succeeded
function Test-CommandSuccess {
    param (
        [int]$ExitCode,
        [string]$ErrorMessage
    )
    
    if ($ExitCode -ne 0) {
        Write-Host $ErrorMessage -ForegroundColor Red
        exit $ExitCode
    }
}

# Function to check if any resources exist for the release
function Test-ResourcesExist {
    param (
        [string]$Namespace,
        [string]$ReleaseName
    )
    
    # Check all resources first
    $allResources = kubectl get all -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" -o json 2>$null | ConvertFrom-Json

    if ($allResources -and $allResources.items -and $allResources.items.Count -gt 0) {
        return $true
    }
    
    # Check individual resource types in case 'get all' doesn't capture everything
    $resourceTypes = @("deployments", "services", "pods", "statefulsets", "daemonsets", "replicasets")
    
    foreach ($type in $resourceTypes) {
        $resources = kubectl get $type -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" -o json 2>$null | ConvertFrom-Json
        if ($resources -and $resources.items -and $resources.items.Count -gt 0) {
            return $true
        }
    }
    
    return $false
}

# Function to detect available labels on resources
function Get-ResourceLabels {
    param (
        [string]$Namespace
    )
    
    $allLabels = @{}
    $resourceJson = kubectl get all -n $Namespace -o json 2>$null | ConvertFrom-Json
    
    if ($resourceJson -and $resourceJson.items) {
        foreach ($item in $resourceJson.items) {
            if ($item.metadata -and $item.metadata.labels) {
                $item.metadata.labels.PSObject.Properties | ForEach-Object {
                    $labelKey = $_.Name
                    $labelValue = $_.Value
                    
                    if (-not $allLabels.ContainsKey($labelKey)) {
                        $allLabels[$labelKey] = @()
                    }
                    
                    if (-not $allLabels[$labelKey].Contains($labelValue)) {
                        $allLabels[$labelKey] += $labelValue
                    }
                }
            }
        }
    }
    
    return $allLabels
}

# Function to wait for resources and then pods to be ready
function Wait-ForResourcesReady {
    param (
        [string]$Namespace,
        [string]$ReleaseName,
        [int]$Timeout
    )
    
    Write-Host "Waiting for resources to be created (timeout: $Timeout seconds)..." -ForegroundColor Cyan
    
    $startTime = Get-Date
    $timeoutTime = $startTime.AddSeconds($Timeout)
    $resourcesCreated = $false
    $workloadsReadyCounter = 0  # Counter for tracking how long all workloads have been ready

    # Initial wait for resources to be created
    while (-not $resourcesCreated -and (Get-Date) -lt $timeoutTime) {
        $resourcesCreated = Test-ResourcesExist -Namespace $Namespace -ReleaseName $ReleaseName
        
        if (-not $resourcesCreated) {
            Write-Host "No resources found for release $ReleaseName. Waiting..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
    
    if (-not $resourcesCreated) {
        $elapsedTime = (Get-Date) - $startTime
        Write-Host "Timeout waiting for resources to be created after $($elapsedTime.TotalSeconds) seconds" -ForegroundColor Red
        
        # Check what labels exist in the namespace
        Write-Host "`nAvailable labels in namespace ${Namespace}:" -ForegroundColor Yellow
        $labels = Get-ResourceLabels -Namespace $Namespace
        foreach ($labelKey in $labels.Keys) {
            $joinedValues = $labels[$labelKey] -join ', '
            Write-Host "  $labelKey = $joinedValues" -ForegroundColor Yellow
        }
        
        return $false
    }
    
    Write-Host "Resources found! Now waiting for all workloads to be ready..." -ForegroundColor Green
    
    # Now wait for all resources to be ready
    $allReady = $false
    $iteration = 0
    
    while (-not $allReady -and (Get-Date) -lt $timeoutTime) {
        $iteration++
        $allWorkloadsReady = $true  # Assume all workloads are ready until proven otherwise
        $pendingResourceDetails = @()  # List to track non-ready resources
        
        Write-Host "`n--- Monitoring iteration $iteration ---" -ForegroundColor Cyan
        
        # Track counts for progress reporting
        $totalResources = 0
        $readyResources = 0
        
        # First check deployments, statefulsets, and daemonsets (main resources)
        $deployments = kubectl get deployments -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" -o json 2>$null | ConvertFrom-Json
        $statefulsets = kubectl get statefulsets -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" -o json 2>$null | ConvertFrom-Json
        $daemonsets = kubectl get daemonsets -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" -o json 2>$null | ConvertFrom-Json
        
        # Check deployments status
        if ($deployments -and $deployments.items) {
            foreach ($deployment in $deployments.items) {
                $totalResources++
                $deploymentName = $deployment.metadata.name
                $deploymentReady = $deployment.status.readyReplicas -eq $deployment.status.replicas
                
                if (-not $deploymentReady) {
                    $allWorkloadsReady = $false  # At least one resource is not ready
                    $readyReplicas = if ($deployment.status.readyReplicas) { $deployment.status.readyReplicas } else { 0 }
                    $pendingResourceDetails += "Deployment $deploymentName not ready: $readyReplicas/$($deployment.status.replicas) replicas available"
                } else {
                    $readyResources++
                }
            }
        }
        
        # Check statefulsets status
        if ($statefulsets -and $statefulsets.items) {
            foreach ($statefulset in $statefulsets.items) {
                $totalResources++
                $statefulsetName = $statefulset.metadata.name
                $statefulsetReady = $statefulset.status.readyReplicas -eq $statefulset.status.replicas
                
                if (-not $statefulsetReady) {
                    $allWorkloadsReady = $false  # At least one resource is not ready
                    $readyReplicas = if ($statefulset.status.readyReplicas) { $statefulset.status.readyReplicas } else { 0 }
                    $pendingResourceDetails += "StatefulSet $statefulsetName not ready: $readyReplicas/$($statefulset.status.replicas) replicas available"
                } else {
                    $readyResources++
                }
            }
        }
        
        # Check daemonsets status
        if ($daemonsets -and $daemonsets.items) {
            foreach ($daemonset in $daemonsets.items) {
                $totalResources++
                $daemonsetName = $daemonset.metadata.name
                $daemonsetReady = $daemonset.status.numberReady -eq $daemonset.status.desiredNumberScheduled
                
                if (-not $daemonsetReady) {
                    $allWorkloadsReady = $false  # At least one resource is not ready
                    $pendingResourceDetails += "DaemonSet $daemonsetName not ready: $($daemonset.status.numberReady)/$($daemonset.status.desiredNumberScheduled) nodes ready"
                } else {
                    $readyResources++
                }
            }
        }
        
        # Display summary progress
        Write-Host "Resource status: $readyResources/$totalResources workloads ready" -ForegroundColor $(if ($readyResources -eq $totalResources) { "Green" } else { "Yellow" })
        
        # Check if we have pods (optional - just for display purposes)
        $podsOutput = kubectl get pods -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" 2>$null
        $podCount = ($podsOutput -split "`n").Count - 1
        if ($podCount -gt 0) {
            Write-Host "Found approximately $podCount pods" -ForegroundColor Cyan
        } else {
            Write-Host "No pods found in listing (this may be normal during resource creation)" -ForegroundColor Yellow
        }
        
        # Display details if there are pending resources
        if ($pendingResourceDetails.Count -gt 0) {
            Write-Host "`nPending workloads:" -ForegroundColor Yellow
            foreach ($detail in $pendingResourceDetails) {
                Write-Host "  * $detail" -ForegroundColor Yellow
            }
        }
        
        # Calculate and show elapsed time and estimated time remaining
        $elapsedTime = (Get-Date) - $startTime
        $remainingTime = $timeoutTime - (Get-Date)
        Write-Host "`nTime elapsed: $([math]::Round($elapsedTime.TotalSeconds))s, Timeout in: $([math]::Round($remainingTime.TotalSeconds))s" -ForegroundColor Cyan
        
        # Determine if we're done - based ONLY on workload readiness, not pod state
        if ($allWorkloadsReady -and $totalResources -gt 0) {
            $workloadsReadyCounter++
            Write-Host "All workloads reported ready for $workloadsReadyCounter consecutive checks" -ForegroundColor Green
            
            # If all workloads have been ready for 3 consecutive iterations, we're done
            if ($workloadsReadyCounter -ge 3) {
                $allReady = $true
                Write-Host "All workloads have been consistently ready. Deployment is complete!" -ForegroundColor Green
                break
            }
        } else {
            $workloadsReadyCounter = 0  # Reset the counter if any workload is not ready
        }
        
        if (-not $allReady) {
            Start-Sleep -Seconds 5
        }
    }
    
    # After while loop completes, check if successful or timed out
    if ($allReady) {
        Write-Host "`nAll resources are ready!" -ForegroundColor Green
        
        # Show details of all running resources with their status
        Write-Host "`nRunning Kubernetes resources:" -ForegroundColor Cyan
        kubectl get all -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName"
        
        # Try to show pod details, but don't fail if they can't be retrieved
        try {
            Write-Host "`nPod details:" -ForegroundColor Cyan
            kubectl get pods -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName" -o wide
        } catch {
            Write-Host "Unable to retrieve detailed pod information, but all workloads are ready" -ForegroundColor Yellow
        }
        
        return $true
    } else {
        $elapsedTime = (Get-Date) - $startTime
        Write-Host "`nTimeout waiting for resources to be ready after $($elapsedTime.TotalSeconds) seconds" -ForegroundColor Red
        
        # Show details of problematic resources
        Write-Host "`nResource status:" -ForegroundColor Red
        kubectl get all -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName"
        
        # Try to show pod descriptions for debugging
        try {
            Write-Host "`nDetailed pod descriptions:" -ForegroundColor Red
            kubectl describe pods -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName"
        } catch {
            Write-Host "Unable to retrieve detailed pod information" -ForegroundColor Yellow
        }
        
        return $false
    }
}

# Display script start information
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "    SynthGen Kubernetes Deployment Script" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Starting deployment with the following parameters:" -ForegroundColor Cyan
Write-Host "  Namespace: $namespace" -ForegroundColor Cyan
Write-Host "  Release: $release" -ForegroundColor Cyan
if ($values) { Write-Host "  Values file: $values" -ForegroundColor Cyan }
Write-Host "  Pod wait timeout: $timeout seconds" -ForegroundColor Cyan
Write-Host "  Wait for Helm deployment: $wait" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Set default values
$ReleaseName = "synthgen"
$Namespace = "synthgen"
$ValuesFile = ""

# Use either the short or long form, preferring the long form
Log-Step -StepNumber 1 -StepDescription "Initializing deployment parameters"
if ($n) { $Namespace = $n } else { $Namespace = $namespace }
if ($r) { $ReleaseName = $r } else { $ReleaseName = $release }
if ($f) { $ValuesFile = $f } else { $ValuesFile = $values }
Write-Host "Using namespace: $Namespace" -ForegroundColor Cyan
Write-Host "Using release name: $ReleaseName" -ForegroundColor Cyan
if ($ValuesFile) { Write-Host "Using values file: $ValuesFile" -ForegroundColor Cyan }

# Check if kubectl is available
Log-Step -StepNumber 2 -StepDescription "Checking required tools availability"
try {
    Write-Host "Checking if kubectl is installed..." -ForegroundColor Cyan
    $kubectlVersion = kubectl version --client -o json 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "kubectl is not installed or not in PATH. Please install kubectl." -ForegroundColor Red
        exit 1
    }
    Write-Host "kubectl is available" -ForegroundColor Green
} catch {
    Write-Host "Error checking kubectl: $_" -ForegroundColor Red
    exit 1
}

# Check if helm is available
try {
    Write-Host "Checking if helm is installed..." -ForegroundColor Cyan
    $helmVersion = helm version --short 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "helm is not installed or not in PATH. Please install helm." -ForegroundColor Red
        exit 1
    }
    Write-Host "helm is available" -ForegroundColor Green
} catch {
    Write-Host "Error checking helm: $_" -ForegroundColor Red
    exit 1
}

# Check if Kubernetes cluster is reachable
Log-Step -StepNumber 3 -StepDescription "Validating Kubernetes cluster connectivity"
Write-Host "Checking Kubernetes cluster connectivity..." -ForegroundColor Cyan
$clusterCheck = kubectl cluster-info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cannot connect to Kubernetes cluster: $clusterCheck" -ForegroundColor Red
    Write-Host "Please ensure your Kubernetes cluster is running and properly configured." -ForegroundColor Yellow
    exit 1
}
Write-Host "Kubernetes cluster is reachable" -ForegroundColor Green

# Check if namespace exists, if not create it
Log-Step -StepNumber 4 -StepDescription "Setting up namespace"
Write-Host "Checking if namespace $Namespace exists..." -ForegroundColor Cyan
$namespaceExists = kubectl get namespace $Namespace 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating namespace $Namespace..." -ForegroundColor Cyan
    kubectl create namespace $Namespace
    Test-CommandSuccess -ExitCode $LASTEXITCODE -ErrorMessage "Failed to create namespace $Namespace"
    Write-Host "Namespace $Namespace created successfully" -ForegroundColor Green
} else {
    Write-Host "Namespace $Namespace already exists" -ForegroundColor Green
}

# Set up values file argument if provided
Log-Step -StepNumber 5 -StepDescription "Validating configuration"
$ValuesArg = ""
if ($ValuesFile) {
    Write-Host "Checking if values file $ValuesFile exists..." -ForegroundColor Cyan
    if (Test-Path $ValuesFile) {
        $ValuesArg = "-f $ValuesFile"
        Write-Host "Values file $ValuesFile is valid" -ForegroundColor Green
    }
    else {
        Write-Host "Values file not found: $ValuesFile" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "No values file specified, using default values" -ForegroundColor Cyan
}

# Install the chart
Log-Step -StepNumber 6 -StepDescription "Installing Helm chart"
Write-Host "Installing $ReleaseName in namespace $Namespace..." -ForegroundColor Cyan
$installCommand = "helm install $ReleaseName ./synthgen-chart $ValuesArg --namespace $Namespace"
if ($wait) {
    Write-Host "Using Helm's built-in wait functionality (timeout: $timeout seconds)" -ForegroundColor Cyan
    $installCommand += " --wait --timeout ${timeout}s"
}
Write-Host "Executing: $installCommand" -ForegroundColor Cyan
Invoke-Expression $installCommand
Test-CommandSuccess -ExitCode $LASTEXITCODE -ErrorMessage "Failed to install Helm chart $ReleaseName in namespace $Namespace"
Write-Host "Helm chart installation initiated successfully" -ForegroundColor Green

# Check deployment status
Log-Step -StepNumber 7 -StepDescription "Checking initial deployment status"
Write-Host "Checking deployment status..." -ForegroundColor Cyan
kubectl get all -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName"
if ($LASTEXITCODE -ne 0) {
    Write-Host "No resources found yet. This is normal immediately after deployment." -ForegroundColor Yellow
} else {
    Write-Host "Initial resources created successfully" -ForegroundColor Green
}

# Wait for pods to be ready if --wait isn't used with helm
if (-not $wait) {
    Log-Step -StepNumber 8 -StepDescription "Monitoring resource and pod readiness"
    $resourcesReady = Wait-ForResourcesReady -Namespace $Namespace -ReleaseName $ReleaseName -Timeout $timeout
    if (-not $resourcesReady) {
        Write-Host "Deployment didn't complete successfully within the timeout period." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Helm's built-in wait was used, skipping additional resource monitoring" -ForegroundColor Cyan
}

# Deployment summary
Log-Step -StepNumber 9 -StepDescription "Deployment summary"
Write-Host "Deployment Status:" -ForegroundColor Cyan
kubectl get all -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName"

Write-Host "`nInstallation complete!" -ForegroundColor Green
Write-Host "To get the application URL and other information, run:" -ForegroundColor Yellow
Write-Host "  helm status $ReleaseName -n $Namespace" -ForegroundColor Yellow 

Log-Step -StepNumber 10 -StepDescription "Deployment completed successfully" 