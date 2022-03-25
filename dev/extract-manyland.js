/** @file A script that extracts manyland's code into separate files. */

const fs = require("fs");
const beautify = require("js-beautify").js;

console.log(process.cwd());

console.log("Starting extraction...");
const code = String(fs.readFileSync("./dev/manyland.txt"));
const matches = code.matchAll(/ig\.baked=!0;/g);

const out = "./dev/out/";

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

/**
 * 
 * @param {string} part 
 * @returns 
 */
function getName(part) {
	return String((part.match(/(?<=(["']\b))(?:(?=(\\?))\2.)*?(?=\1)/g) || [])[0]) + ".js";
}

/** @type {[name: string, code: string][]} */
const parts = [];
let lastIndex = 0;
for (const matchArray of matches) {
	const index = matchArray.index;
	if (!index) { throw new Error() }
	const codePart = code.substring(lastIndex, index);
	const name = getName(codePart);
	parts.push([name, codePart]);
	lastIndex = index;
}
const finalPart = code.substring(lastIndex);
parts.push([getName(finalPart), finalPart]);
/** @type {any} */(parts)[0][0] = "1-prelude.js";

console.log("Writing files.json");
fs.writeFileSync(out + "0-files.json", JSON.stringify(parts.map(part => part[0])));

for (const part of parts) {
	console.log("Beautifying " + part[0]);
	part[1] = beautify(part[1], {

	});
}

for (const part of parts) {
	console.log("Writing " + part[0]);
	fs.writeFileSync(out + part[0], part[1]);
}