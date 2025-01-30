#!/usr/bin/env node
import { run } from './run.js';
import chalk from 'chalk';

(async () => {
    try {
        await run();
    } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
    }
})();

