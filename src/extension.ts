import * as vscode from 'vscode';
import ExtensionRoot from './ExtensionRoot';

export function activate(extensionContext: vscode.ExtensionContext) {
	const extensionRoot = new ExtensionRoot(extensionContext)
	console.log("Initialised extension root.")
}