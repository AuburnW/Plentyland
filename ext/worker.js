(() => {
	/**
	 * Unwraps the given nullable value, throwing an error if it's null or undefined.
	 * @template T
	 * @param {T | null | undefined} value 
	 */
	function unwrap(value) {
		if (value == null) {
			throw new Error();
		}
		return value;
	}

	/** @type {[bitmap: ArrayBuffer, width: number, height: number, x: number, y: number][]} */
	const loadTextures = [];

	/**
	 * @template {keyof ClientCommands} T
	 * @param {T} command 
	 * @param {Transferable[] | null} transfer 
	 * @param  {Parameters<ClientCommands[T]>} args 
	 */
	function sendClientCommand(command, transfer, ...args) {
		if (transfer) {
			/** @type {any} */(self).postMessage([command, ...args], transfer);
		} else {
			/** @type {any} */(self).postMessage([command, ...args]);
		}
	}

	// Atlas texture parameters
	let textureSizeMagnitude = 0;
	let textureSize = 0;

	/** @type {WorkerCommands} */
	const workerCommands = {
		initialize: (offscreenCanvas, textureMagnitude) => {
			textureSizeMagnitude = textureMagnitude;
			textureSize = 1 << textureSizeMagnitude;

			canvas = offscreenCanvas;

			gl = unwrap(canvas.getContext(
				"webgl",
				{
					"alpha": false,
					"antialias": false,
					"depth": false,
				}
			));

			// Initialize WebGL

			const shaderProgram = unwrap(gl.createProgram());
			const vertexShader = unwrap(gl.createShader(gl.VERTEX_SHADER));
			gl.shaderSource(
				vertexShader,
				// Vertex position
				"attribute vec2 a;" +
				// Vertex delta position
				"attribute vec2 b;" +
				// Vertex texture coordinate
				"attribute vec2 c;" +
				// Vertex color
				"attribute lowp vec4 g;" +
				// Output texture coordinate
				"varying vec2 d;" +
				// Output vertex color
				"varying lowp vec4 h;" +
				// Interpolation input
				"uniform float e;" +
				// Vertex shader
				"void main(){" +
				// Final position.
				"vec2 f=a+b*e;" +
				// Set position output.
				"gl_Position=vec4(f.xy,0.0,1.0);" +
				// Convert texture coordinates to texture space.
				"d=c*" + (1 / textureSize) + ";" +
				// Pass through vertex color
				"h=g;" +
				"}"
			);
			gl.compileShader(vertexShader);

			const fragmentShader = unwrap(gl.createShader(gl.FRAGMENT_SHADER));
			gl.shaderSource(
				fragmentShader,
				"precision mediump float;" +
				// Texture coordinate
				"varying vec2 d;" +
				// Vertex color
				"varying lowp vec4 h;" +
				// Texture
				"uniform sampler2D f;" +
				// Fragment shader
				"void main(){" +
				// Get color from texture and multiply by vertex color
				"gl_FragColor=texture2D(f,d)*h;" +
				"}"
			);
			gl.compileShader(fragmentShader);

			gl.attachShader(shaderProgram, vertexShader);
			gl.attachShader(shaderProgram, fragmentShader);
			gl.linkProgram(shaderProgram);

			const vertexResult = gl.getShaderInfoLog(vertexShader);
			if (vertexResult) {
				throw new Error("Vertex shader error: " + vertexResult);
			}

			const fragmentResult = gl.getShaderInfoLog(fragmentShader);
			if (fragmentResult) {
				throw new Error("Fragment shader error: " + fragmentResult);
			}

			const programResult = gl.getProgramInfoLog(shaderProgram);
			if (programResult) {
				throw new Error("Program error: " + programResult);
			}

			// Initialize atlas texture.

			const texture = gl.createTexture();

			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				// Level of detail
				0,
				// Internal format
				gl.RGBA,
				// Width
				textureSize,
				// Height
				textureSize,
				// Border
				0,
				// Source format
				gl.RGBA,
				// Texel type
				gl.UNSIGNED_BYTE,
				// Data
				new Uint8Array(textureSize * textureSize * 4)
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

			// Initialize vertex buffer

			const vertexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

			const vertexPositionIndex = 0;
			const vertexDeltaPositionIndex = vertexPositionIndex + 8;
			const vertexTextureCoordinatesIndex = vertexDeltaPositionIndex + 8;
			const vertexColorIndex = vertexTextureCoordinatesIndex + 4;
			const stride = vertexColorIndex + 4;

			const vertexPosition = gl.getAttribLocation(shaderProgram, "a");
			gl.vertexAttribPointer(
				// Vertex position
				vertexPosition,
				// Number of components
				2,
				// Vertex type
				gl.FLOAT,
				// Normalize
				false,
				// Stride
				stride,
				// Offset
				vertexPositionIndex
			);
			gl.enableVertexAttribArray(vertexPosition);

			const vertexDeltaPosition = gl.getAttribLocation(shaderProgram, "b");
			gl.vertexAttribPointer(
				// Vertex delta position
				vertexDeltaPosition,
				// Number of components
				2,
				// Vertex type
				gl.FLOAT,
				// Normalize
				false,
				// Stride
				stride,
				// Offset
				vertexDeltaPositionIndex
			);
			gl.enableVertexAttribArray(vertexDeltaPosition);

			const textureCoordinates = gl.getAttribLocation(shaderProgram, "c");
			gl.vertexAttribPointer(
				textureCoordinates,
				// Number of components
				2,
				// Type
				gl.SHORT,
				// Normalize
				false,
				// Stride
				stride,
				// Offset
				vertexTextureCoordinatesIndex
			);
			gl.enableVertexAttribArray(textureCoordinates);

			const vertexColor = gl.getAttribLocation(shaderProgram, "g");
			gl.vertexAttribPointer(
				vertexColor,
				// Number of components
				4,
				// Type
				gl.UNSIGNED_BYTE,
				// Normalize
				true,
				// Stride
				stride,
				// Offset
				vertexColorIndex
			);
			gl.enableVertexAttribArray(vertexColor);

			gl.useProgram(shaderProgram);
			interpolationUniform = unwrap(gl.getUniformLocation(shaderProgram, "e"));
			gl.uniform1f(interpolationUniform, 0);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			requestAnimationFrame(render);
		},
		loadGeometry: (
			geometry,
			geometryLength,
			vertexCount,
			interpolationStart,
			interpolationFactor
		) => {
			if (geometry.byteLength === 0) {
				throw new Error("Tried to load detached geometry buffer.");
			};
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Uint8Array(geometry, 0, geometryLength),
				gl.DYNAMIC_DRAW
			);
			drawLength = vertexCount;
			drawInterpolationStart = interpolationStart;
			drawInterpolationFactor = interpolationFactor;
			// Send geometry buffer back to client
			sendClientCommand("returnBuffer", [geometry], geometry);
			gl.viewport(0, 0, canvas.width, canvas.height);

			for (const [bitmap, width, height, x, y] of loadTextures) {
				gl.texSubImage2D(
					gl.TEXTURE_2D, // Target
					0, // Mipmap level
					x, // xoffset
					y, // yoffset
					width, // width
					height, // height
					gl.RGBA, // format
					gl.UNSIGNED_BYTE, // type
					new Uint8Array(bitmap) // pixels
				);
			}
			loadTextures.length = 0;
		},
		uploadToAtlas: (bitmap, width, height, x, y) => {
			if (bitmap.byteLength !== width * height * 4) {
				throw new Error(
					"Image to load is malformed (bytes: " +
					bitmap.byteLength +
					", width: " +
					width +
					", height: " +
					height +
					")"
				)
			}
			loadTextures.push([bitmap, width, height, x, y]);
		}
	};

	self.addEventListener("message", message => {
		const data = message.data;
		workerCommands[data.shift()](...data);
	});
	function render() {
		let interpolation = Math.min(
			(Date.now() - drawInterpolationStart) * drawInterpolationFactor,
			5
		);
		gl.uniform1f(interpolationUniform, interpolation);
		gl.drawArrays(gl.TRIANGLES, 0, drawLength);
		requestAnimationFrame(render);
	}

	/** @type {?WebGLUniformLocation} */
	let interpolationUniform = null;
	let drawInterpolationStart = 0;
	let drawInterpolationFactor = 0;

	let drawLength = 0;

	// Initialization

	/** @type {HTMLCanvasElement} */
	let canvas = /** @type {any} */(null);
	/** @type {WebGLRenderingContext} */
	let gl = /**@type {any} */(null);

})();

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