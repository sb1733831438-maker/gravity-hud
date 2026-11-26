#!/usr/bin/env node
import { main } from '../lib/cli.js';

const code = main(process.argv.slice(2), process.env);
process.exitCode = code;
