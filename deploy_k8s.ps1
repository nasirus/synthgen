#!/usr/bin/env pwsh

param (
    [string]$n,
    [string]$namespace = "synthgen",
    [string]$r,
    [string]$release = "synthgen",
    [string]$f,
    [string]$values = ""
)

# Set default values
$ReleaseName = "synthgen"
$Namespace = "synthgen"
$ValuesFile = ""

# Use either the short or long form, preferring the long form
if ($n) { $Namespace = $n } else { $Namespace = $namespace }
if ($r) { $ReleaseName = $r } else { $ReleaseName = $release }
if ($f) { $ValuesFile = $f } else { $ValuesFile = $values }

# Check if namespace exists, if not create it
$namespaceExists = kubectl get namespace $Namespace 2>$null
if (-not $namespaceExists) {
    Write-Host "Creating namespace $Namespace..."
    kubectl create namespace $Namespace
}

# Set up values file argument if provided
$ValuesArg = ""
if ($ValuesFile) {
    if (Test-Path $ValuesFile) {
        $ValuesArg = "-f $ValuesFile"
    }
    else {
        Write-Host "Values file not found: $ValuesFile" -ForegroundColor Red
        exit 1
    }
}

# Install the chart
Write-Host "Installing $ReleaseName in namespace $Namespace..." -ForegroundColor Cyan
Invoke-Expression "helm install $ReleaseName ./synthgen-chart $ValuesArg --namespace $Namespace"

# Check status
Write-Host "Checking deployment status..." -ForegroundColor Cyan
kubectl get pods -n $Namespace -l "app.kubernetes.io/instance=$ReleaseName"

Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "To get the application URL and other information, run:" -ForegroundColor Yellow
Write-Host "  helm status $ReleaseName -n $Namespace" -ForegroundColor Yellow 