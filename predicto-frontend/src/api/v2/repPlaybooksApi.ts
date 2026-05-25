export async function fetchRepPlaybooks() {
    const res = await fetch("/v2/attribution/rep-playbook");
    if (!res.ok) throw new Error("Failed to fetch rep playbooks");
    return res.json();
}
