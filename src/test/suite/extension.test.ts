import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('McCzarny.flexible-log-analyzer'));
	});

	test('Should register all expected commands', async () => {
		const commands = await vscode.commands.getCommands(true);
		const extensionCommands = [
			'flexible-log-analyzer.analyzeCurrentFile',
			'flexible-log-analyzer.analyzeAllFiles',
			'flexible-log-analyzer.clearResults',
			'flexible-log-analyzer.openConfiguration',
			'flexible-log-analyzer.createConfiguration',
			'flexible-log-analyzer.refreshTree',
			'flexible-log-analyzer.jumpToLocation'
		];

		for (const command of extensionCommands) {
			assert.ok(
				commands.includes(command),
				`Command ${command} should be registered`
			);
		}
	});

	test('Should activate extension', async () => {
		const extension = vscode.extensions.getExtension('McCzarny.flexible-log-analyzer');
		if (extension) {
			await extension.activate();
			assert.ok(extension.isActive);
		}
	});
});
