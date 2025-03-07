import { NextResponse } from "next/server";
import { serverHealthService } from "@/lib/api/server";

export async function GET() {
    try {
        const data = await serverHealthService.getHealthCheck();
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Error fetching health data from API:", error);
        return NextResponse.json(
            { error: "Failed to fetch health data from API" },
            { status: 500 }
        );
    }
} 