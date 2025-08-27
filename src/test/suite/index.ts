import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 20000
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		// Recursively find all test files
		const findTestFiles = (dir: string): string[] => {
			const files: string[] = [];
			
			try {
				const items = fs.readdirSync(dir);
				
				for (const item of items) {
					const fullPath = path.join(dir, item);
					const stat = fs.statSync(fullPath);
					
					if (stat.isDirectory()) {
						files.push(...findTestFiles(fullPath));
					} else if (item.endsWith('.test.js')) {
						files.push(path.relative(testsRoot, fullPath));
					}
				}
			} catch (err) {
				console.warn(`Could not read directory ${dir}:`, err);
			}
			
			return files;
		};

		try {
			const files = findTestFiles(testsRoot);
			console.log(`Found ${files.length} test files:`, files);
			
			// Add files to the test suite
			files.forEach(f => {
				const fullPath = path.resolve(testsRoot, f);
				console.log(`Adding test file: ${fullPath}`);
				mocha.addFile(fullPath);
			});

			// Run the mocha test
			mocha.run((failures: number) => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error('Error setting up tests:', err);
			e(err);
		}
	});
}
