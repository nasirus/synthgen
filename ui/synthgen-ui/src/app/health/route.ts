import { NextRequest, NextResponse } from "next/server";
import { HEALTH_CHECK_URL } from "@/lib/config";

export async function GET(_request: NextRequest) {
    try {
        const response = await fetch(HEALTH_CHECK_URL, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            // Always use no-store for API routes
            cache: "no-store",
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
    } catch (error) {
        console.error("Error proxying to health endpoint:", error);
        return NextResponse.json(
            { error: "Failed to fetch health data from API" },
            { status: 500 }
        );
    }
} 