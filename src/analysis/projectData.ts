import * as fs from 'fs';
import * as JSONC from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';

export type ProjectData = {
	resourcePackDir: string,
	behaviorPackDir: string,
	scriptsDir: string,
	minEngineVersion: number[],
	defaultFormatVersion: string
}

export function getProjectData(): ProjectData | undefined {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (rootPath === undefined) {
		return;
	}
	const configPath = rootPath + "/config.json";
	if (!fs.existsSync(configPath)) {
		vscode.window.showErrorMessage("Unable to find config.json");
		return;
	}
	const config = JSONC.parse(fs.readFileSync(configPath).toString());

	const behaviorPackDir = path.join(rootPath, config.packs.behaviorPack);
	const resourcePackDir = path.join(rootPath, config.packs.resourcePack);
		const scriptsDir = config.packs.scripts
		? path.join(rootPath, config.packs.scripts)
		: path.join(behaviorPackDir, "scripts"); // it can be inside BP as well

	if (!fs.existsSync(behaviorPackDir)) {
		vscode.window.showErrorMessage("Unable to find BP");
		return;
	}
	if (!fs.existsSync(resourcePackDir)) {
		vscode.window.showErrorMessage("Unable to find RP");
		return;
	}
	const minEngineVersion = [1, 26, 0];
	const defaultFormatVersion = minEngineVersion.join(".");

	return { resourcePackDir, behaviorPackDir, scriptsDir, minEngineVersion, defaultFormatVersion };
}
