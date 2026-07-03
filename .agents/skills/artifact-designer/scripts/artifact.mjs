#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const refsDir = join(skillDir, 'references');
const MAX_TEMP_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_TEMP_FILES = 1000;
const TARGET_TOTAL_BYTES = 16 * 1024 * 1024;

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const cwd = resolve(args.cwd || process.cwd());

try {
  if (command === 'create') await createArtifact(args);
  else if (command === 'build') await buildDist(cwd, required(args.id, '--id'));
  else if (command === 'validate') await validateCommand(args);
  else if (command === 'list') await listArtifactsCommand(args);
  else if (command === 'preview') await previewCommand(args);
  else if (command === 'publish') await publishCommand(args);
  else if (command === 'import-url') await importUrlCommand(args);
  else usage(0);
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq !== -1) out[raw.slice(2, eq)] = raw.slice(eq + 1);
    else {
      const key = raw.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else out[key] = argv[++i];
    }
  }
  return out;
}
function required(value, name) { if (!value) throw new Error(`Missing required ${name}`); return value; }
function usage(code = 1) {
  console.log(`Portable Artifact skill helper\n\nUsage:\n  node scripts/artifact.mjs create --title "Title" [--instructions "..."] [--kind report] [--id slug] [--format html|md]\n  node scripts/artifact.mjs validate --id slug [--strict]\n  node scripts/artifact.mjs preview --id slug [--open]\n  node scripts/artifact.mjs publish --id slug [--target temporary|permanent] [--domain example.com] [--noindex false]\n  node scripts/artifact.mjs list\n  node scripts/artifact.mjs import-url --url https://... [--title "Title"] [--id slug]\n`);
  process.exit(code);
}

function artifactsRoot(cwd) { return join(cwd, '.artifacts'); }
function slugify(input) { return String(input || 'artifact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54) || 'artifact'; }
function artifactDir(cwd, id) { return join(artifactsRoot(cwd), id); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function indent(s, spaces) { const pad = ' '.repeat(spaces); return s.split('\n').map(line => line ? pad + line : line).join('\n'); }

async function readTextAsset(name) { return readFile(join(refsDir, name), 'utf8'); }
async function resolveDesignSystem(cwd) {
  const candidates = [
    { scope: 'project', path: join(cwd, '.artifacts', 'DESIGN.md') },
    { scope: 'user', path: join(process.env.HOME || '', '.artifact-designer', 'DESIGN.md') },
  ];
  for (const candidate of candidates) {
    if (candidate.path && existsSync(candidate.path)) {
      const content = await readFile(candidate.path, 'utf8');
      return { ...candidate, content, displayPath: candidate.path };
    }
  }
  return null;
}

async function createArtifact(args) {
  const title = required(args.title, '--title');
  const base = artifactsRoot(cwd);
  await mkdir(base, { recursive: true });
  let id = args.id ? slugify(args.id) : slugify(title);
  let dir = artifactDir(cwd, id);
  if (!args.id) {
    let suffix = 2;
    while (existsSync(join(dir, 'artifact.json'))) {
      id = `${slugify(title)}-${suffix++}`;
      dir = artifactDir(cwd, id);
    }
  }
  await mkdir(join(dir, 'source'), { recursive: true });
  await mkdir(join(dir, 'dist'), { recursive: true });
  await mkdir(join(dir, 'deploy'), { recursive: true });

  const format = args.format === 'md' ? 'md' : 'html';
  const design = await resolveDesignSystem(cwd);
  const entryName = format === 'md' ? 'index.md' : 'index.html';
  const sourcePath = join(dir, 'source', entryName);
  if (!existsSync(sourcePath)) {
    if (format === 'md') {
      await writeFile(sourcePath, `# ${title}\n\nReplace this scaffold with the artifact content.\n`, 'utf8');
    } else {
      const theme = await readTextAsset('artifact-theme.css');
      const template = await readTextAsset('artifact-template.html');
      const designNote = design ? `Project/user design system active: ${escapeHtml(design.displayPath)}. Follow it for visual choices while preserving self-contained artifact constraints.` : 'This artifact uses Artifact UI, grounded in Vercel Geist.';
      const content = `    <header class="artifact-header">\n      <div>\n        <h1 class="artifact-title">${escapeHtml(title)}</h1>\n        <p class="artifact-subtitle">Replace this scaffold with the artifact content.</p>\n      </div>\n      <span class="artifact-badge artifact-badge-blue">Draft</span>\n    </header>\n    <section class="artifact-card artifact-stack">\n      <p>${designNote}</p>\n    </section>`;
      const html = template
        .replace('{{title}}', escapeHtml(title))
        .replace('{{artifactThemeCss}}', indent(theme, 4))
        .replace('{{artifactSpecificCss}}', '')
        .replace('{{artifactContent}}', content)
        .replace('{{artifactScript}}', '');
      await writeFile(sourcePath, html, 'utf8');
    }
  }
  await buildDist(cwd, id);
  const now = new Date().toISOString();
  const metaPath = join(dir, 'artifact.json');
  if (!existsSync(metaPath)) {
    await writeMetadata(cwd, {
      id,
      title,
      kind: args.kind,
      instructions: args.instructions,
      createdAt: now,
      updatedAt: now,
      designSystem: design ? { scope: design.scope, path: design.displayPath } : { scope: 'built-in' },
      format,
      entry: `dist/${entryName}`,
      versions: [{ version: 1, createdAt: now, path: `dist/${entryName}` }]
    });
  }
  console.log(`Created artifact ${id}\nSource: ${sourcePath}\nDist: ${join(dir, 'dist', entryName)}`);
}

async function findEntryFile(cwd, id) {
  const sourceDir = join(artifactDir(cwd, id), 'source');
  for (const name of ['index.md', 'index.html', 'index.htm', 'README.md']) {
    const p = join(sourceDir, name);
    if (existsSync(p)) return p;
  }
}
async function buildDist(cwd, id, noindex = true) {
  const dir = artifactDir(cwd, id);
  await mkdir(join(dir, 'dist'), { recursive: true });
  const sourceDir = join(dir, 'source');
  if (existsSync(sourceDir)) {
    for (const f of await walkFiles(sourceDir)) {
      const relDir = f.rel.split('/').slice(0, -1).join('/');
      if (relDir) await mkdir(join(dir, 'dist', relDir), { recursive: true });
      await cp(f.path, join(dir, 'dist', f.rel));
    }
  }
  const headers = ['/*', noindex ? '  X-Robots-Tag: noindex' : undefined, '  Referrer-Policy: no-referrer', '  X-Content-Type-Options: nosniff'].filter(Boolean).join('\n') + '\n';
  await writeFile(join(dir, 'dist', '_headers'), headers, 'utf8');
  let title = id;
  try { title = (await readMetadata(cwd, id)).title || id; } catch {}
  await writeFile(join(dir, 'dist', 'thumbnail.svg'), renderThumbnail(title), 'utf8');
}
function renderThumbnail(title) {
  const safe = escapeHtml(title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#fafafa"/><rect x="48" y="48" width="1104" height="534" rx="16" fill="#fff" stroke="#000" stroke-opacity=".12"/><text x="96" y="170" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="28" fill="#4d4d4d">Artifact</text><text x="96" y="300" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="64" font-weight="600" letter-spacing="-3" fill="#171717">${safe}</text><circle cx="1088" cy="112" r="24" fill="#006bff"/></svg>`;
}
async function walkFiles(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const p = join(current, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) { const s = await stat(p); out.push({ path: p, rel: relative(dir, p), bytes: s.size }); }
    }
  }
  if (existsSync(dir)) await walk(dir);
  return out;
}
async function readMetadata(cwd, id) { return JSON.parse(await readFile(join(artifactDir(cwd, id), 'artifact.json'), 'utf8')); }
async function writeMetadata(cwd, meta) { meta.updatedAt = new Date().toISOString(); await writeFile(join(artifactDir(cwd, meta.id), 'artifact.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8'); }

async function validateCommand(args) {
  const id = required(args.id, '--id');
  await buildDist(cwd, id, args.noindex !== 'false');
  const result = await validateArtifact(cwd, id, Boolean(args.strict));
  console.log(formatValidation(result));
  process.exit(result.ok ? 0 : 2);
}
async function validateArtifact(cwd, id, strict = false) {
  const dir = artifactDir(cwd, id);
  const dist = join(dir, 'dist');
  const entrySource = await findEntryFile(cwd, id);
  const entryName = entrySource ? entrySource.split('/').pop() : 'index.html';
  const entry = join(dist, entryName);
  const isMarkdown = entryName.endsWith('.md');
  const issues = [];
  if (!existsSync(join(dir, 'artifact.json'))) issues.push({ severity: 'error', code: 'missing_metadata', message: `Missing artifact metadata for ${id}.` });
  if (!existsSync(entry)) return { ok: false, issues: [...issues, { severity: 'error', code: 'missing_entry', message: `Missing dist/${entryName}.` }], fileCount: 0, totalBytes: 0 };
  const files = await walkFiles(dist);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (files.length > MAX_TEMP_FILES) issues.push({ severity: 'error', code: 'too_many_files', message: `Cloudflare temporary Workers assets support at most ${MAX_TEMP_FILES} files; found ${files.length}.` });
  for (const f of files) if (f.bytes > MAX_TEMP_ASSET_BYTES) issues.push({ severity: 'error', code: 'file_too_large', file: f.rel, message: `${f.rel} is ${(f.bytes / 1024 / 1024).toFixed(2)} MiB; limit is 5 MiB per file.` });
  if (totalBytes > TARGET_TOTAL_BYTES) issues.push({ severity: strict ? 'error' : 'warning', code: 'total_size_large', message: `Total artifact size is ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; target is <= 16 MiB.` });
  const content = await readFile(entry, 'utf8');
  if (!isMarkdown) {
    const checks = [
      [/<script\s+[^>]*src\s*=\s*["']https?:\/\//i, 'external_script', 'External script source detected.'],
      [/<link\s+[^>]*href\s*=\s*["']https?:\/\//i, 'external_stylesheet', 'External stylesheet/font link detected.'],
      [/<img\s+[^>]*src\s*=\s*["']https?:\/\//i, 'external_image', 'External image detected; embed as data URI or inline SVG.'],
      [/@import\s+url\(\s*["']?https?:\/\//i, 'external_css_import', 'External CSS import detected.'],
      [/\bfetch\s*\(/i, 'fetch', 'fetch() detected; artifacts must not call APIs at view time.'],
      [/\bXMLHttpRequest\b/i, 'xhr', 'XMLHttpRequest detected; artifacts must not call APIs at view time.'],
      [/\bWebSocket\b/i, 'websocket', 'WebSocket detected; artifacts must not call APIs at view time.'],
    ];
    for (const [re, code, message] of checks) if (re.test(content)) issues.push({ severity: strict ? 'error' : 'warning', code, message, file: entryName });
    if (!content.includes('Artifact UI') && !content.includes('--artifact-background-100') && !content.includes('artifact-shell')) issues.push({ severity: strict ? 'error' : 'warning', code: 'missing_design_system', message: 'Artifact does not appear to include Artifact UI theme/classes.', file: entryName });
  }
  return { ok: !issues.some(i => i.severity === 'error'), issues, fileCount: files.length, totalBytes };
}
function formatValidation(result) {
  const lines = [`${result.ok ? 'OK' : 'FAILED'}: ${result.fileCount} files, ${(result.totalBytes / 1024).toFixed(1)} KiB`];
  for (const issue of result.issues) lines.push(`${issue.severity.toUpperCase()} ${issue.code}${issue.file ? ` (${issue.file})` : ''}: ${issue.message}`);
  return lines.join('\n');
}

async function listArtifactsCommand() {
  const root = artifactsRoot(cwd);
  if (!existsSync(root)) { console.log('No artifacts found.'); return; }
  const metas = [];
  for (const name of await readdir(root)) {
    try { const p = join(root, name, 'artifact.json'); if (existsSync(p)) metas.push(JSON.parse(await readFile(p, 'utf8'))); } catch {}
  }
  metas.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  console.log(metas.length ? metas.map(m => `- ${m.id}: ${m.title}${m.latestPublishedUrl ? ` (${m.latestPublishedUrl})` : ''}`).join('\n') : 'No artifacts found.');
}

const mime = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
async function previewCommand(args) {
  const id = required(args.id, '--id');
  await buildDist(cwd, id);
  const distDir = join(artifactDir(cwd, id), 'dist');
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const safeRel = url.pathname.replace(/^\/+/, '').replace(/\.\.+/g, '');
    let p = join(distDir, safeRel);
    if (!safeRel || safeRel.endsWith('/')) for (const idx of ['index.html', 'index.md', 'index.htm', 'README.md']) if (existsSync(join(distDir, idx))) { p = join(distDir, idx); break; }
    if (!resolve(p).startsWith(resolve(distDir)) || !existsSync(p)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[extname(p)] || 'application/octet-stream' });
    createReadStream(p).pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(args.port) || 0, '127.0.0.1', resolve); });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Preview: ${url}`);
  if (args.open) openUrl(url);
}
function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const argv = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(cmd, argv, { detached: true, stdio: 'ignore' }); child.unref();
}

async function importUrlCommand(args) {
  const url = required(args.url, '--url');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const text = await response.text();
  const isMarkdown = url.endsWith('.md') || response.headers.get('content-type')?.includes('markdown');
  const inferredTitle = args.title || text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || (isMarkdown ? text.match(/^#\s+(.+)$/m)?.[1]?.trim() : null) || new URL(url).hostname;
  await createArtifact({ ...args, title: inferredTitle, format: isMarkdown ? 'md' : 'html' });
  const id = args.id ? slugify(args.id) : slugify(inferredTitle);
  const entryName = isMarkdown ? 'index.md' : 'index.html';
  await writeFile(join(artifactDir(cwd, id), 'source', entryName), text, 'utf8');
  await buildDist(cwd, id);
  const meta = await readMetadata(cwd, id);
  meta.latestPublishedUrl = url;
  await writeMetadata(cwd, meta);
  console.log(`Imported ${url} as artifact ${id}`);
}

async function publishCommand(args) {
  const id = required(args.id, '--id');
  const target = args.target === 'permanent' || args.target === 'cloudflare-permanent' ? 'permanent' : 'temporary';
  await buildDist(cwd, id, args.noindex !== 'false');
  const validation = await validateArtifact(cwd, id, true);
  if (!validation.ok) throw new Error(`Publish blocked by validation errors:\n${formatValidation(validation)}`);
  const { deployDir, configPath } = await writeWranglerProject(cwd, id);
  const npxArgs = ['--yes', 'wrangler@latest', 'deploy', '--config', configPath];
  if (target === 'temporary') npxArgs.push('--temporary');
  if (target === 'permanent' && args.domain) npxArgs.push('--domain', args.domain);
  const tempHome = target === 'temporary' ? await mkdtemp(join(tmpdir(), 'artifact-skill-wrangler-home-')) : undefined;
  try {
    const result = await run('npx', npxArgs, deployDir, tempHome ? isolatedCloudflareEnv(tempHome) : process.env);
    if (result.code !== 0) throw new Error(`Wrangler failed (${result.code})\n${result.output}`);
    const url = result.output.match(/https:\/\/[^\s]+\.workers\.dev[^\s]*/)?.[0];
    const claimUrl = result.output.match(/https:\/\/dash\.cloudflare\.com\/workers-and-pages\/claim\?[^\s]+/)?.[0];
    if (!url) throw new Error(`Could not find workers.dev URL in wrangler output\n${result.output}`);
    const meta = await readMetadata(cwd, id);
    meta.latestPublishedUrl = url;
    meta.versions ||= [];
    meta.versions.push({ version: (meta.versions.at(-1)?.version || 0) + 1, createdAt: new Date().toISOString(), path: 'dist/index.html', published: { target, url, claimUrl } });
    await writeMetadata(cwd, meta);
    console.log(`Published artifact:\n${url}${claimUrl ? `\nClaim within 60 minutes: ${claimUrl}` : ''}`);
  } finally { if (tempHome) await rm(tempHome, { recursive: true, force: true }); }
}
async function writeWranglerProject(cwd, id) {
  const dir = artifactDir(cwd, id);
  const deployDir = join(dir, 'deploy');
  await mkdir(deployDir, { recursive: true });
  const configPath = join(deployDir, 'wrangler.jsonc');
  await writeFile(configPath, JSON.stringify({ name: `artifact-${slugify(id)}`, compatibility_date: '2026-01-01', assets: { directory: '../dist' } }, null, 2) + '\n', 'utf8');
  return { deployDir, configPath };
}
function isolatedCloudflareEnv(home) {
  const env = { ...process.env };
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'CF_EMAIL', 'CF_API_KEY']) delete env[key];
  env.HOME = home; env.XDG_CONFIG_HOME = join(home, '.config'); return env;
}
function run(cmd, argv, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd, env });
    let output = '';
    child.stdout.on('data', c => { output += c; process.stdout.write(c); });
    child.stderr.on('data', c => { output += c; process.stderr.write(c); });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}
