import { isJsonArray, normalize, strings, workspaces } from '@angular-devkit/core';
import {
  apply,
  branchAndMerge,
  chain,
  filter,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  SchematicsException,
  template,
  Tree,
  url,
} from '@angular-devkit/schematics';
import { getProject, getSourceRoot } from '../../utils/project';
import { Builders } from '@schematics/angular/utility/workspace-models';
import { constructPath } from '../../utils/paths';
import { getWorkspace, updateWorkspace } from "@schematics/angular/utility/workspace";

export default function migration(options: any): Rule {
  return chain([
    configure(options),
    createNewFiles(options),
  ]);
}

function updateAppInWorkspaceFile(
  options: { stylesExtension: string },
  workspace: workspaces.WorkspaceDefinition,
  project: workspaces.ProjectDefinition, name: string): Rule {

  const projectRoot = normalize(project.root);
  const sourceRoot = getSourceRoot(project.sourceRoot);
  const sourceRootParts = sourceRoot.split('/');

  workspace.projects.delete(name);
  workspace.projects.add({
      name,
      root: projectRoot,
      sourceRoot,
      projectType: 'application',
      targets: {
        build: {
          builder: Builders.Browser,
          options: {
            outputPath: constructPath(['dist', 'playground']),
            index: constructPath([...sourceRootParts, 'index.html']),
            main: constructPath(['.angular-playground', 'main.playground.ts']),
            polyfills: constructPath([...sourceRootParts, 'polyfills.ts']),
            tsConfig: constructPath(['.angular-playground', `tsconfig.playground.json`]),
            aot: false,
            assets: [
              constructPath([...sourceRootParts, 'favicon.ico']),
              constructPath([...sourceRootParts, 'assets']),
            ],
            styles: [
              constructPath([...sourceRootParts, `styles.${options.stylesExtension}`]),
            ],
            scripts: [],
          },
          configurations: {
            production: {
              fileReplacements: [
                {
                  replace: constructPath([...sourceRootParts, 'environments', 'environment.ts']),
                  with: constructPath([...sourceRootParts, 'environments', 'environment.prod.ts']),
                },
              ],
              buildOptimizer: false,
              extractLicenses: false,
              outputHashing: 'all'
            },
            development: {
              buildOptimizer: false,
              optimization: false,
              vendorChunk: true,
              extractLicenses: false,
              sourceMap: true,
              namedChunks: true
            }
          },
          defaultConfiguration: 'development'
        },
        serve: {
          builder: Builders.DevServer,
          options: {
            browserTarget: 'playground:build',
            port: 4201
          }
        }
      }
    }
  );

  return updateWorkspace(workspace);
}

function configure(options: any): Rule {
  return async (tree: Tree) => {
    const workspace = await getWorkspace(tree);
    const project = getProject(workspace, options, 'application');

    if (!project) {
      throw new SchematicsException('Your app must have at least 1 project to use Playground.');
    }

    let stylesExtension = 'css';
    const buildTarget = project.targets.get('build');
    if (
      buildTarget
      && buildTarget.options
      && buildTarget.options.styles
      && isJsonArray(buildTarget.options.styles)
    ) {
      const mainStyle = buildTarget.options.styles
        .find((path: string | { input: string }) => typeof path === 'string'
          ? path.includes('/styles.')
          : path.input.includes('/styles.'));
      if (mainStyle) {
        // @ts-ignore
        const mainStyleString = typeof mainStyle === 'string' ? mainStyle : mainStyle.input;
        stylesExtension = mainStyleString.split('.').pop();
      }
    }

    return chain([
        updateAppInWorkspaceFile({stylesExtension}, workspace, project, 'playground'),
    ]);
  };
}

function createNewFiles(options: any): Rule {
  // @ts-ignore
  return async (tree: Tree, context: SchematicContext) => {
    const playgroundDir = '.angular-playground';
    const workspace = await getWorkspace(tree);
    const project = getProject(workspace, options);

    const sourceRoot = getSourceRoot(project?.sourceRoot);
    const angularPlaygroundJsonTemplateSource = apply(url('./files'), [
      filter(path => path.endsWith('angular-playground.json')),
      template({
        ...strings,
        sourceRoots: [sourceRoot],
      }),
      move(playgroundDir),
    ]);
    const tsconfigJsonTemplateSource = apply(url('./files'), [
      filter(path => path.endsWith('tsconfig.playground.json')),
      template({}),
      move(playgroundDir),
    ]);
    const playgroundMainTemplateSource = apply(url('./files'), [
      filter(path => path.endsWith('main.playground.ts')),
      template({}),
      move(playgroundDir),
    ]);
    const sandboxesTemplateSource = apply(url('./files'), [
      filter(path => path.endsWith('sandboxes.ts')),
      template({}),
      move(playgroundDir),
    ]);
    return chain([
      branchAndMerge(mergeWith(angularPlaygroundJsonTemplateSource)),
      branchAndMerge(mergeWith(tsconfigJsonTemplateSource)),
      branchAndMerge(mergeWith(playgroundMainTemplateSource)),
      branchAndMerge(mergeWith(sandboxesTemplateSource)),
      branchAndMerge(createIfNotExists(`${playgroundDir}/.gitignore`, 'sandboxes.ts')),
      branchAndMerge(deleteIfExists('angular-playground.json')),
      branchAndMerge(deleteIfExists('tsconfig.playground.json')),
      branchAndMerge(deleteIfExists(`${sourceRoot}/main.playground.json`)),
    ]);
  };
}

function deleteIfExists(path: string): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    if (tree.exists(path)) {
      tree.delete(path);
    }
    return tree;
  };
}

function createIfNotExists(path: string, content: string): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    if (tree.exists(path)) {
      tree.create(path, content);
    }
    return tree;
  };
}
