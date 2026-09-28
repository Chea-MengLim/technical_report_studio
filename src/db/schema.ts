import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import type { DocNode } from "@/lib/doc";

export const roleEnum = pgEnum("role", ["ADMIN", "EDITOR"]);
export const projectStatusEnum = pgEnum("project_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RETURNED",
]);
export const sectionKindEnum = pgEnum("section_kind", ["FRONT", "BODY", "APPENDIX"]);
export const buildKindEnum = pgEnum("build_kind", ["PROJECT", "BOOK"]);
export const buildStatusEnum = pgEnum("build_status", [
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "FAILED",
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("EDITOR"),
  createdAt: createdAt(),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null = shared book asset (institution logo, book cover images)
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  ext: text("ext").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  /** Short project name, e.g. "SQLyst". Used for \projname and the profile page. */
  name: text("name").notNull(),
  /** Second line of the cover title, e.g. "Simplified data amplifies insight". */
  tagline: text("tagline").notNull().default(""),
  /** Paragraph under the cover title. */
  description: text("description").notNull().default(""),
  /** Label above the cover title. */
  reportType: text("report_type").notNull().default("TECHNICAL REPORT"),
  /** Left footer text, e.g. "SQLyst Web Application". */
  footerName: text("footer_name").notNull().default(""),
  teamName: text("team_name").notNull().default(""),
  logoAssetId: uuid("logo_asset_id"),
  bookOrder: integer("book_order").notNull().default(0),
  status: projectStatusEnum("status").notNull().default("DRAFT"),
  reviewComment: text("review_comment"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/** People printed in the report (profile page, contributors page). Not app users. */
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  email: text("email").notNull().default(""),
  photoAssetId: uuid("photo_asset_id"),
  order: integer("order").notNull().default(0),
});

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: sectionKindEnum("kind").notNull().default("BODY"),
    title: text("title").notNull(),
    order: integer("order").notNull().default(0),
    /** Start this section on a new page. */
    newPage: boolean("new_page").notNull().default(false),
    /** "contributors": content is followed by the generated member list. */
    special: text("special"),
    content: jsonb("content").$type<DocNode>().notNull(),
    version: integer("version").notNull().default(1),
    lockedById: uuid("locked_by_id").references(() => users.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [index("sections_project_idx").on(t.projectId)],
);

export const sectionRevisions = pgTable(
  "section_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: jsonb("content").$type<DocNode>().notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("revisions_section_idx").on(t.sectionId)],
);

export const references = pgTable("references", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  /** e.g. "Embedding Database" */
  text: text("text").notNull(),
  url: text("url").notNull().default(""),
});

/** Single-row table with the merged book settings. */
export const book = pgTable("book", {
  id: integer("id").primaryKey().default(1),
  title: text("title").notNull().default("Advanced Course Project Reports"),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  institution: text("institution").notNull().default("Korea Software HRD Center"),
  academicYear: text("academic_year").notNull().default("2025–2026"),
  copyright: text("copyright")
    .notNull()
    .default("© 2026 Korea Software HRD Center. All rights reserved."),
  institutionLogoAssetId: uuid("institution_logo_asset_id"),
  /** Book preface section (content edited by the admin). */
  prefaceSectionId: uuid("preface_section_id"),
  tocDepth: integer("toc_depth").notNull().default(1),
  approvedOnly: boolean("approved_only").notNull().default(true),
  updatedAt: updatedAt(),
});

export const builds = pgTable("builds", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: buildKindEnum("kind").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  status: buildStatusEnum("status").notNull().default("QUEUED"),
  pdfKey: text("pdf_key"),
  zipKey: text("zip_key"),
  pages: integer("pages"),
  log: text("log"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Reference = typeof references.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Book = typeof book.$inferSelect;
export type Build = typeof builds.$inferSelect;
