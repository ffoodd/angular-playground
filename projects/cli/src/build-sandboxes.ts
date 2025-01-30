import { writeFile, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join as joinPath, resolve as resolvePath } from 'path';
import { fromDirMultiple } from './from-dir.js';
import { StringBuilder } from './string-builder.js';

export const SANDBOX_MENU_ITEMS_FILE = resolvePath(__dirname, './sandbox-menu-items.js');

export interface SandboxFileInformation {
    key: string;
    srcPath: string;
    searchKey: string;
    name: string;
    label: string;
    scenarioMenuItems: {
        key: number;
        description: string;
    }[];
}

export async function buildSandboxes(srcPaths: string[], chunk: boolean, makeSandboxMenuItemFile: boolean, definedSandboxesPath: string): Promise<string[]> {
    const chunkMode = chunk ? 'lazy' : 'eager';
    const homes = srcPaths.map(srcPath => resolvePath(srcPath));
    const sandboxes = findSandboxes(homes);

    if (makeSandboxMenuItemFile) {
        await buildSandboxMenuItemFile(sandboxes);
    }
    const rootPath = resolvePath(definedSandboxesPath);
    if (!existsSync(rootPath)) {
        mkdirSync(rootPath);
    }
    return await buildSandboxFileContents(rootPath, sandboxes, chunkMode, writeSandboxContent).then(results => {
        console.log('Successfully compiled sandbox files.');
        return results;
    });
}

export function findSandboxes(homes: string[]): SandboxFileInformation[] {
    const sandboxes = [];

    fromDirMultiple(homes, /\.sandbox.ts$/, /.*node_modules.*/, (filename, home) => {
        const sandboxPath = filename.replace(home, '.').replace(/.ts$/, '').replace(/\\/g, '/');
        const contents = readFileSync(filename, 'utf8');

        const matchSandboxOf = /\s?sandboxOf\s*\(\s*([^)]+?)\s*\)/g.exec(contents);
        if (matchSandboxOf) {
            const typeName = matchSandboxOf[1].split(',')[0].trim();
            const labelText = /label\s*:\s*['"](.+)['"]/g.exec(matchSandboxOf[0]);
            const uniqueIdText = /uniqueId\s*:\s*['"](.+)['"]/g.exec(matchSandboxOf[0]);

            const scenarioMenuItems = [];

            // Tested with https://regex101.com/r/mtp2Fy/2
            // First scenario: May follow directly after sandboxOf function ).add
            // Other scenarios: .add with possible whitespace before. Ignore outcommented lines.
            const scenarioRegex = /^(?!\/\/)(?:\s*|.*\))\.add\s*\(\s*['"](.+)['"]\s*,\s*{/gm;
            let scenarioMatches;
            let scenarioIndex = 1;
            while ((scenarioMatches = scenarioRegex.exec(contents)) !== null) {
                scenarioMenuItems.push({key: scenarioIndex, description: scenarioMatches[1]});
                scenarioIndex++;
            }

            const label = labelText ? labelText[1] : '';
            sandboxes.push({
                key: sandboxPath,
                uniqueId: uniqueIdText ? uniqueIdText[1] : undefined,
                srcPath: home,
                searchKey: `${typeName}${label}`,
                name: typeName,
                label,
                scenarioMenuItems,
            });
        }
    });

    return sandboxes;
}

async function writeSandboxContent(filePath, fileContent): Promise<string> {
    return new Promise((resolve, reject) => {
        writeFile(filePath, fileContent, err => {
            if (err) {
                reject(new Error('Unable to compile sandboxes.'));
            }
            resolve(filePath);
        });
    });
}

export function buildSandboxFileContents(
    rootPath: string,
    sandboxes: SandboxFileInformation[],
    chunkMode: string,
    writeContents: (file, contents) => Promise<string>) {
    const promises: Promise<string>[] = [];

    const filename = joinPath(rootPath, 'sandboxes.ts');
    createSandboxesFileIfNotExists(filename);

    let contents = readFileSync(filename, 'utf8');

    if (contents.indexOf('*GET_SANDBOX*') !== -1) {
        const sandboxMenuItemsMethodBody = buildGetSandboxMenuItemMethodBodyContent(sandboxes);
        contents = contents.replace(
            /(\/\*GET_SANDBOX_MENU_ITEMS\*\/).*?(?=\/\*END_GET_SANDBOX_MENU_ITEMS\*\/)/s,
            `$1\n ${sandboxMenuItemsMethodBody} \n`
        );
        const sandboxMethodBody = buildGetSandboxMethodBodyContent(sandboxes, chunkMode);
        contents = contents.replace(/(\/\*GET_SANDBOX\*\/).*?(?=\/\*END_GET_SANDBOX\*\/)/s, `$1\n ${sandboxMethodBody} \n`);
        promises.push(writeContents(filename, contents));
    }

    return Promise.all(promises);
}

export function createSandboxesFileIfNotExists(filename: string) {
    if (!existsSync(filename)) {
        const fileContent = `
// DO NOT MODIFY.... This file is filled in via the Playground CLI.

export class SandboxesDefined {
  getSandbox(path: string): any {
    /*GET_SANDBOX*/
    /*END_GET_SANDBOX*/
  }
  getSandboxMenuItems(): any {
    /*GET_SANDBOX_MENU_ITEMS*/
    return [];
    /*END_GET_SANDBOX_MENU_ITEMS*/
  }
}`;

        writeFileSync(filename, fileContent);
    }
}

export function buildGetSandboxMethodBodyContent(sandboxes: SandboxFileInformation[], chunkMode: string): string {
    const content = new StringBuilder();
    content.addLine(`switch(path) {`);

    sandboxes.forEach(({key, srcPath}) => {
        let fullPath = joinPath(srcPath, key);
        // Normalize slash syntax for Windows/Unix filepaths
        fullPath = slash(fullPath);
        content.addLine(`case '${key}':`);
        content.addLine(`  return import( /* webpackMode: "${chunkMode}" */ '${fullPath}').then(function(_){ return _.default.serialize('${key}'); });`);
    });
    content.addLine(`}`);

    return content.dump();
}

export function buildGetSandboxMenuItemMethodBodyContent(sandboxes: SandboxFileInformation[]): string {
    return `return ${JSON.stringify(sandboxes)};`;
}

export async function buildSandboxMenuItemFile(sandboxes: SandboxFileInformation[]) {
    const content = new StringBuilder();
    content.addLine(`function getSandboxMenuItems() {`);
    content.addLine(`return ${JSON.stringify(sandboxes)};`);
    content.addLine(`}`);
    content.addLine('exports.getSandboxMenuItems = getSandboxMenuItems;');

    await writeSandboxContent(SANDBOX_MENU_ITEMS_FILE, content.dump());
}

// Turns windows URL string ('c:\\etc\\') into URL node expects ('c:/etc/')
// https://github.com/sindresorhus/slash
export function slash(input: string) {
    const isExtendedLengthPath = /^\\\\\?\\/.test(input);
    const hasNonAscii = /[^\u0000-\u0080]+/.test(input);

    if (isExtendedLengthPath || hasNonAscii) {
        return input;
    }

    return input.replace(/\\/g, '/');
}
