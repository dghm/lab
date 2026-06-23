import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findEmployeeByEmail } from "@/lib/airtable";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "請輸入 Email 和密碼" }, { status: 400 });
  }

  const employee = await findEmployeeByEmail(email);
  if (!employee || !employee.passwordHash) {
    return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, employee.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
  }

  await createSession({
    employeeId: employee.id,
    name: employee.name,
    email: employee.email,
  });

  return NextResponse.json({ ok: true });
}
