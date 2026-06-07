import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, resolve } from "path";
import type { CoreSoulModule } from "./alt-theory-core.js";

export interface CoreSoulAssembly {
  content: string;
  basePath: string;
  modules: CoreSoulModule[];
}

function parseModulePath(path: string): CoreSoulModule {
  const filename = basename(path);
  const match = /^core-soul-([a-z0-9]+)-([a-z0-9][a-z0-9-]*)\.md$/i.exec(
    filename
  );

  if (!match) {
    throw new Error(
      `Invalid core-soul module filename "${filename}"; expected core-soul-{variable}-{value}.md`
    );
  }

  return {
    slug: `${match[1]}-${match[2]}`.toLowerCase(),
    variable: match[1].toLowerCase(),
    value: match[2].toLowerCase(),
    path: resolve(path),
  };
}

export function assembleCoreSoul(config: {
  basePath: string;
  modulesDir: string;
  activeModules?: string[];
}): CoreSoulAssembly {
  const basePath = resolve(config.basePath);
  const modulesDir = resolve(config.modulesDir);

  if (!existsSync(basePath)) {
    throw new Error(`Core-soul base file not found: ${basePath}`);
  }
  if (!existsSync(modulesDir)) {
    throw new Error(`Core-soul modules directory not found: ${modulesDir}`);
  }

  const available = readdirSync(modulesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith("core-soul-") &&
        entry.name.endsWith(".md")
    )
    .map((entry) => parseModulePath(resolve(modulesDir, entry.name)));

  const bySlug = new Map(available.map((module) => [module.slug, module]));
  const requested = (config.activeModules ?? []).map((slug) =>
    slug.toLowerCase()
  );
  const modules = requested.map((slug) => {
    const module = bySlug.get(slug);
    if (!module) {
      throw new Error(`Unknown core-soul module: ${slug}`);
    }
    return module;
  });

  const activeVariables = new Set<string>();
  for (const module of modules) {
    if (activeVariables.has(module.variable)) {
      throw new Error(
        `Multiple core-soul values selected for variable: ${module.variable}`
      );
    }
    activeVariables.add(module.variable);
  }

  modules.sort((left, right) => left.slug.localeCompare(right.slug));
  const content = [
    readFileSync(basePath, "utf-8"),
    ...modules.map((module) => readFileSync(module.path, "utf-8")),
  ].join("\n\n");

  return { content, basePath, modules };
}
