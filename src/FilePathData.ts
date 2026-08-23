import path from 'path';

/**
 * A representation of a file path for files within add-on folders.
 * Used to simplify code that copies files from one add-on to another as well as validation.
*/ 
export type FilePathData = {
	relativePath: string; // the path relative to the RP/BP directory. e.g. entity\awesome.entity.json
	rootType: "bp" | "rp";
	exactPath: string;
};

export function filePathsEqual(a: FilePathData, b: FilePathData) {
	return a.exactPath === b.exactPath;
}

export function changeFilePathBase(filePath: FilePathData, resourcePackDir: string, behaviorPackDir: string): FilePathData {
	const newFilePath = { ...filePath };
	if (newFilePath.rootType === "bp") {
		newFilePath.exactPath = path.join(behaviorPackDir, newFilePath.relativePath);
	} else {
		newFilePath.exactPath = path.join(resourcePackDir, newFilePath.relativePath);
	}
	return newFilePath;
}

export function getDetailedPathInfo(resourcePackDir: string, behaviorPackDir: string, exactPath: string): FilePathData {
	let rootType: FilePathData['rootType'];
	let relativePath: FilePathData['relativePath'];
	if (exactPath.startsWith(resourcePackDir)) {
		rootType = 'rp';
		relativePath = path.relative(resourcePackDir, exactPath);
	} else if (exactPath.startsWith(behaviorPackDir)) {
		rootType = 'bp';
		relativePath = path.relative(behaviorPackDir, exactPath);
	} else {
		console.log(resourcePackDir, behaviorPackDir, exactPath);
		throw Error("Cannot categorise file.");
	}

	return {
		relativePath: relativePath,
		rootType: rootType,
		exactPath: exactPath
	};
}