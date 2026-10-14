import { randomUUID } from "crypto";
import { sql } from "./db";

// حدود سياق المشروع اللي بيتحقن في الـ system prompt (نفس ميزانية المرفقات)
export const PROJECT_FILE_MAX_CHARS = 12_000;
export const PROJECT_TOTAL_MAX_CHARS = 24_000;

export interface Project {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
  sessionCount?: number;
}

export interface ProjectFile {
  id: string;
  path: string;
  lang: string;
  content: string;
}

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sessionCount: row.session_count !== undefined ? Number(row.session_count) : undefined,
  };
}

async function ownProject(userId: string, projectId: string): Promise<any | null> {
  const rows = (await sql`
    SELECT id, user_id, name, instructions, created_at, updated_at FROM projects
    WHERE id = ${projectId} AND user_id = ${userId}
  `) as any[];
  return rows[0] ?? null;
}

export async function listProjects(userId: string): Promise<Project[]> {
  const rows = (await sql`
    SELECT p.id, p.name, p.instructions, p.created_at, p.updated_at,
      (SELECT COUNT(*)::int FROM chat_sessions s WHERE s.project_id = p.id AND s.user_id = ${userId}) AS session_count
    FROM projects p WHERE p.user_id = ${userId} ORDER BY p.updated_at DESC
  `) as any[];
  return rows.map(mapProject);
}

export async function createProject(userId: string, name: string): Promise<Project> {
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO projects (id, user_id, name, instructions)
    VALUES (${id}, ${userId}, ${name}, '')
    RETURNING id, name, instructions, created_at, updated_at
  `) as any[];
  return mapProject(rows[0]);
}

export async function updateProject(
  userId: string,
  id: string,
  patch: { name?: string; instructions?: string }
): Promise<Project | null> {
  const existing = await ownProject(userId, id);
  if (!existing) return null;
  const name = patch.name !== undefined ? patch.name : existing.name;
  const instructions = patch.instructions !== undefined ? patch.instructions : existing.instructions;
  const rows = (await sql`
    UPDATE projects SET name = ${name}, instructions = ${instructions}, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, name, instructions, created_at, updated_at
  `) as any[];
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const existing = await ownProject(userId, id);
  if (!existing) return false;
  await sql`DELETE FROM project_files WHERE project_id = ${id}`;
  await sql`UPDATE chat_sessions SET project_id = NULL WHERE project_id = ${id} AND user_id = ${userId}`;
  await sql`DELETE FROM projects WHERE id = ${id} AND user_id = ${userId}`;
  return true;
}

export async function listProjectFiles(userId: string, projectId: string): Promise<ProjectFile[] | null> {
  const existing = await ownProject(userId, projectId);
  if (!existing) return null;
  const rows = (await sql`
    SELECT id, path, lang, content FROM project_files
    WHERE project_id = ${projectId} ORDER BY path ASC
  `) as any[];
  return rows.map((r: any) => ({ id: r.id, path: r.path, lang: r.lang ?? "", content: r.content ?? "" }));
}

export async function upsertProjectFile(
  userId: string,
  projectId: string,
  path: string,
  lang: string,
  content: string
): Promise<ProjectFile | null> {
  const existing = await ownProject(userId, projectId);
  if (!existing) return null;
  const capped = content.slice(0, PROJECT_FILE_MAX_CHARS);
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO project_files (id, project_id, path, lang, content, updated_at)
    VALUES (${id}, ${projectId}, ${path}, ${lang}, ${capped}, NOW())
    ON CONFLICT (project_id, path) DO UPDATE SET lang = EXCLUDED.lang, content = EXCLUDED.content, updated_at = NOW()
    RETURNING id, path, lang, content
  `) as any[];
  await sql`UPDATE projects SET updated_at = NOW() WHERE id = ${projectId}`;
  return rows[0] ? { id: rows[0].id, path: rows[0].path, lang: rows[0].lang ?? "", content: rows[0].content ?? "" } : null;
}

export async function replaceProjectFiles(
  userId: string,
  projectId: string,
  files: { path: string; lang: string; content: string }[]
): Promise<ProjectFile[] | null> {
  const existing = await ownProject(userId, projectId);
  if (!existing) return null;
  await sql`DELETE FROM project_files WHERE project_id = ${projectId}`;
  const out: ProjectFile[] = [];
  for (const f of files) {
    const saved = await upsertProjectFile(userId, projectId, f.path, f.lang, f.content);
    if (saved) out.push(saved);
  }
  return out;
}

export async function deleteProjectFile(
  userId: string,
  projectId: string,
  path: string
): Promise<boolean> {
  const existing = await ownProject(userId, projectId);
  if (!existing) return false;
  await sql`DELETE FROM project_files WHERE project_id = ${projectId} AND path = ${path}`;
  return true;
}

export async function attachSession(
  userId: string,
  sessionId: string,
  projectId: string | null
): Promise<{ ok: true } | { ok: false; reason: "session" | "project" }> {
  const srows = (await sql`
    SELECT id FROM chat_sessions WHERE id = ${sessionId} AND user_id = ${userId}
  `) as any[];
  if (srows.length === 0) return { ok: false, reason: "session" };
  if (projectId !== null) {
    const p = await ownProject(userId, projectId);
    if (!p) return { ok: false, reason: "project" };
  }
  await sql`UPDATE chat_sessions SET project_id = ${projectId} WHERE id = ${sessionId} AND user_id = ${userId}`;
  return { ok: true };
}

export interface ProjectContext {
  instructions: string;
  filesManifest: string;
  fileContents: string;
  projectId: string | null;
  projectName: string | null;
}

/** سياق المشروع المرتبط بالجلسة: تعليمات + فهرس ملفات + محتوى بميزانية محدودة. */
export async function getProjectContext(
  userId: string,
  sessionId?: string | null
): Promise<ProjectContext> {
  const empty: ProjectContext = {
    instructions: "",
    filesManifest: "",
    fileContents: "",
    projectId: null,
    projectName: null,
  };
  if (!sessionId) return empty;
  let projectId: string | null = null;
  try {
    const srows = (await sql`
      SELECT project_id FROM chat_sessions WHERE id = ${sessionId} AND user_id = ${userId}
    `) as { project_id: string | null }[];
    projectId = srows[0]?.project_id ?? null;
  } catch {
    return empty;
  }
  if (!projectId) return empty;
  const proj = await ownProject(userId, projectId);
  if (!proj) return empty;
  const files = (await listProjectFiles(userId, projectId)) ?? [];
  const manifestLines = files.map(
    (f) => `- ${f.path} (${f.lang || "نص"}، ${f.content.length} حرف)`
  );
  const manifest = manifestLines.join("\n");
  let budget = PROJECT_TOTAL_MAX_CHARS;
  const parts: string[] = [];
  for (const f of files) {
    if (budget <= 0) break;
    const slice = f.content.slice(0, Math.min(PROJECT_FILE_MAX_CHARS, budget));
    budget -= slice.length;
    parts.push(`### ${f.path}\n${slice}`);
    if (f.content.length > slice.length) {
      parts.push(`(… بقية الملف مقتطعة — اطلب من المستخدم لصق الجزء المطلوب كاملًا لو احتجته)`);
    }
  }
  return {
    instructions: (proj.instructions ?? "").trim(),
    filesManifest: manifest,
    fileContents: parts.join("\n\n"),
    projectId: proj.id,
    projectName: proj.name,
  };
}

/** كتلة جاهزة للحقن في الـ system prompt (فارغة لو مفيش مشروع مرتبط). */
export function buildProjectContextBlock(ctx: ProjectContext): string {
  if (!ctx.projectId) return "";
  const lines = [`PROJECT CONTEXT (المشروع المرتبط بهذه المحادثة: "${ctx.projectName}"): `];
  if (ctx.instructions) lines.push(`- تعليمات المشروع:\n"""\n${ctx.instructions.slice(0, 2000)}\n"""`);
  if (ctx.filesManifest) {
    lines.push(
      `- ملفات المشروع (فهرس فقط — اطلب من المستخدم لصق الملف الكامل لو احتجت ما وراء المقتطف):\n${ctx.filesManifest}`
    );
  }
  if (ctx.fileContents) lines.push(`- مقتطفات الملفات:\n${ctx.fileContents}`);
  if (lines.length === 1) return "";
  return lines.join("\n");
}
