import * as vscode from 'vscode';
import { TreeNode } from './treeNode';
import * as treeNode from './treeNode';

export class TestView {
  constructor(context: vscode.ExtensionContext) {
    const view = vscode.window.createTreeView(
      'customisable-log-analyser-view',
      {
        treeDataProvider: aNodeWithIdTreeDataProvider(),
        showCollapseAll: true,
      },
    );
    context.subscriptions.push(view);
  }
}

const testInfo: TreeNode[] = [
  {
    uri: ['info', 'Version is: x.x.x.'],
    title: 'Version is: x.x.x.',
    description: 'Version of XXX is x.x.x.',
    fileReference: [
      {
        uri: [
          'info',
          'Version is: x.x.x.',
          'C:\\Users\\czarneckim\\repositories\\customisable-log-analyser\\CHANGELOG.md',
        ],
        filePath:
          'C:\\Users\\czarneckim\\repositories\\customisable-log-analyser\\CHANGELOG.md',
        line: 5,
      },
    ],
  },
];

const nodes: TreeNode[] = [
  {
    name: 'info',
    icon: '$(info)',
    entries: testInfo,
    uri: ['info'],
  } as TreeNode,
];

function aNodeWithIdTreeDataProvider(): vscode.TreeDataProvider<TreeNode> {
  return {
    getChildren: (element?: TreeNode): TreeNode[] => {
      return getChildren(element);
    },
    getTreeItem: (element: TreeNode): vscode.TreeItem => {
      const treeItem = getTreeItem(element);
      return treeItem;
    },
  };
}

function getChildren(key?: TreeNode): TreeNode[] {
  if (!key) {
    return nodes;
  }

  if ('entries' in key) {
    return key.entries;
  }

  if ('fileReference' in key) {
    return key.fileReference;
  }
  return [];
}

function getTreeItem(key: TreeNode): vscode.TreeItem {
  const treeElement = key; //getTreeElement(key);
  // An example of how to use codicons in a MarkdownString in a tree item tooltip.
  const tooltip = new vscode.MarkdownString(
    `${treeNode.getIcon(key)} ${treeNode.getTooltip(key)}`,
    true,
  );
  return {
    label: /**vscode.TreeItemLabel**/ <any>{ label: treeNode.getLabel(key) },
    id: key.uri.join('/'),
    command: treeNode.getAction(key),
    tooltip,
    collapsibleState:
      treeElement && treeNode.isLeafNode(treeElement)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
  };
}
