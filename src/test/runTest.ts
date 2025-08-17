import * as path from 'path';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Download and unzip VS Code if needed
		const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
		
		// Run the integration test
		await runTests({ 
			vscodeExecutablePath,
			extensionDevelopmentPath, 
			extensionTestsPath
		});
	} catch (err) {
		console.error('Failed to run tests:', err);
		process.exit(1);
	}
}

main();
