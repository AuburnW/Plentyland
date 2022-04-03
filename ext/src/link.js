// An export declaration is needed to tell typescript that this file is a module.
export const module = true;

/** 
 * @typedef {{
 * 		returnBuffer: (buffer: ArrayBuffer) => void
 * }} ClientCommands
 */

/**
 * @typedef {{
 * 		initialize: (
 * 			offscreenCanvas: HTMLCanvasElement,
 * 			textureMagnitude: number,
 * 		) => void,
 * 		loadGeometry: (
 * 			geometry: ArrayBuffer,
 * 			geometryLength: number,
 * 			vertexCount: number,
 * 			interpolationStart: number,
 * 			interpolationFactor: number
 * 		) => void,
 * 		uploadToAtlas: (
 * 			bitmap: ArrayBuffer,
 * 			width: number,
 * 			height: number,
 * 			x: number,
 * 			y: number,
 * 		) => void
 * }} WorkerCommands
 */