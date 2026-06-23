import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID!
);

export type Employee = {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  passwordHash: string;
};

export async function findEmployeeByEmail(email: string): Promise<Employee | null> {
  const records = await base("Employees")
    .select({
      filterByFormula: `LOWER({Email}) = LOWER("${email.replace(/"/g, '\\"')}")`,
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) return null;

  const record = records[0];
  return {
    id: record.id,
    name: record.get("Name") as string,
    email: record.get("Email") as string,
    department: record.get("Department") as string,
    title: record.get("Title") as string,
    passwordHash: record.get("PasswordHash") as string,
  };
}

export async function listAnnouncements() {
  const records = await base("Announcements")
    .select({ sort: [{ field: "PostedDate", direction: "desc" }] })
    .firstPage();

  return records.map((r) => ({
    id: r.id,
    title: r.get("Title") as string,
    content: r.get("Content") as string,
    postedDate: r.get("PostedDate") as string,
    pinned: Boolean(r.get("Pinned")),
  }));
}
