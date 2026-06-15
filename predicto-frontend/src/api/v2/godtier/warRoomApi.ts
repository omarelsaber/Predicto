const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

export async function fetchWarRoom(): Promise<any> {
    const res = await fetch(`${API_URL}/api/v2/godtier/deals/war-room`);
    if (!res.ok) {
        throw new Error(`Failed to fetch war room data`);
    }
    return res.json();
}

