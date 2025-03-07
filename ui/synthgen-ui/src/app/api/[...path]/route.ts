import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/config";

// Next.js App Router pattern for route handlers with Promise-based params
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        // Await the params Promise to get the actual path value
        const resolvedParams = await params;
        const path = resolvedParams.path.join("/");

        const searchParams = request.nextUrl.searchParams.toString();
        const queryString = searchParams ? `?${searchParams}` : "";

        // Fix: Ensure we don't have any leading slashes in path to prevent double slashes
        const formattedPath = path.startsWith('/') ? path.substring(1) : path;
        const url = `${API_BASE_URL}/${formattedPath}${queryString}`;

        // Get the Authorization header from the incoming request
        const authHeader = request.headers.get("Authorization");

        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        // If the Authorization header exists, forward it
        if (authHeader) {
            headers["Authorization"] = authHeader;
        }

        const response = await fetch(url, {
            method: "GET",
            headers,
            cache: "no-store", // Always set to no-store for API routes
        });

        // Handle non-JSON responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            return NextResponse.json(data, {
                status: response.status,
            });
        } else {
            // Handle non-JSON responses (like text)
            const text = await response.text();
            return new NextResponse(text, {
                status: response.status,
                headers: {
                    "Content-Type": contentType || "text/plain",
                },
            });
        }
    } catch (error: unknown) {
        console.error("API route error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}

// Implement POST method
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        // Await the params Promise to get the actual path value
        const resolvedParams = await params;
        const path = resolvedParams.path.join("/");

        // Fix: Ensure we don't have any leading slashes in path to prevent double slashes
        const formattedPath = path.startsWith('/') ? path.substring(1) : path;
        const url = `${API_BASE_URL}/${formattedPath}`;

        // Get the Authorization header from the incoming request
        const authHeader = request.headers.get("Authorization");

        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        // If the Authorization header exists, forward it
        if (authHeader) {
            headers["Authorization"] = authHeader;
        }

        // Get the request body
        const body = await request.json();

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });

        // Handle non-JSON responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            return NextResponse.json(data, {
                status: response.status,
            });
        } else {
            // Handle non-JSON responses (like text)
            const text = await response.text();
            return new NextResponse(text, {
                status: response.status,
                headers: {
                    "Content-Type": contentType || "text/plain",
                },
            });
        }
    } catch (error: unknown) {
        console.error("API route error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}

// Implement DELETE method
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        // Await the params Promise to get the actual path value
        const resolvedParams = await params;
        const path = resolvedParams.path.join("/");

        // Fix: Ensure we don't have any leading slashes in path to prevent double slashes
        const formattedPath = path.startsWith('/') ? path.substring(1) : path;
        const url = `${API_BASE_URL}/${formattedPath}`;

        // Get the Authorization header from the incoming request
        const authHeader = request.headers.get("Authorization");

        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        // If the Authorization header exists, forward it
        if (authHeader) {
            headers["Authorization"] = authHeader;
        }

        const response = await fetch(url, {
            method: "DELETE",
            headers,
        });

        // Handle non-JSON responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            return NextResponse.json(data, {
                status: response.status,
            });
        } else {
            // Handle non-JSON responses (like text)
            const text = await response.text();
            return new NextResponse(text, {
                status: response.status,
                headers: {
                    "Content-Type": contentType || "text/plain",
                },
            });
        }
    } catch (error: unknown) {
        console.error("API route error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}