export async function fetchDealPriority() {
    const res = await fetch("/api/v2/deals/priority");
    if (!res.ok) throw new Error("Failed to fetch deal priority");
    return res.json();
}
