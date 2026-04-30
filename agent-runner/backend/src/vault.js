import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs"
import { dirname, join, basename } from "node:path"
import matter from "gray-matter"

export function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : ""
}

export function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, "utf8")
}

export function move(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  renameSync(from, to)
}

export function list(dir, ext = ".md") {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith(ext)).map(f => join(dir, f))
}

export function parseFrontmatter(content) {
  if (!content) return { data: {}, content: "" }
  try {
    const { data, content: body } = matter(content)
    return { data: data || {}, content: body || "" }
  } catch {
    return { data: {}, content }
  }
}

export function readWithFrontmatter(path) {
  return parseFrontmatter(read(path))
}

export function writeWithFrontmatter(path, data, body) {
  const out = matter.stringify(body || "", data || {})
  write(path, out)
}

export function basenameNoExt(path) {
  return basename(path).replace(/\.md$/, "")
}
