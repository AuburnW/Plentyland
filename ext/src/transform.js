/**
 * Utility functions for manipulating transform matrices.
 */
export class Transform {
	/**
	 * Returns the x component of the given point multiplied by the transform matrix.
	 * @param {number} x
	 * @param {number} y
	 * @param {Transform.Matrix} matrix 
	 */
	static getX(x, y, matrix) {
		return matrix[0] * x + matrix[2] * y + matrix[4];
	}

	/**
	 * eturns the y component of the given point multiplied by the transform matrix.
	 * @param {number} x
	 * @param {number} y
	 * @param {Transform.Matrix} matrix 
	 */
	static getY(x, y, matrix) {
		return matrix[1] * x + matrix[3] * y + matrix[5];
	}

	/**
	 * Multiplies `a` by `b`, storing the result in `a`.
	 * @param {Transform.Matrix} a 
	 * @param {Transform.Matrix} b
	 */
	static multiply(a, b) {
		const r0 = a[0] * b[0] + a[2] * b[1];
		const r1 = a[1] * b[0] + a[3] * b[1];
		const r2 = a[0] * b[2] + a[2] * b[3];
		const r3 = a[1] * b[2] + a[3] * b[3];
		const r4 = a[0] * b[4] + a[2] * b[5] + a[4];
		const r5 = a[1] * b[4] + a[3] * b[5] + a[5];
		a[0] = r0;
		a[1] = r1;
		a[2] = r2;
		a[3] = r3;
		a[4] = r4;
		a[5] = r5;
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {Transform.Matrix} matrix
	 */
	static translate(x, y, matrix) {
		matrix[4] = matrix[0] * x + matrix[2] * y + matrix[4];
		matrix[5] = matrix[1] * x + matrix[3] * y + matrix[5];
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {Transform.Matrix} matrix 
	 */
	static scale(x, y, matrix) {
		matrix[0] = matrix[0] * x;
		matrix[1] = matrix[1] * x;
		matrix[2] = matrix[2] * y;
		matrix[3] = matrix[3] * y;
	}

	static createMatrix() {
		return /** @type {Transform.Matrix} */(new Float64Array([1, 0, 0, 1, 0, 0]));
	}

	/**
	 * 
	 * @param {Float64Array & [x: number, y: number]} point 
	 * @param {Transform.Matrix} matrix 
	 * @param {Float64Array & [x: number, y: number]} result 
	 */
	static point(point, matrix, result) {
		result[0] = matrix[0] * point[0] + matrix[2] * point[1];
		result[1] = matrix[1] * point[0] + matrix[3] * point[1];
	}
}

/** 
 * @typedef {Float64Array & [
 * 		c1r1: number,
 * 		c1r2: number,
 * 		c2r1: number,
 * 		c2r2: number,
 * 		c3r1: number,
 * 		c3r2: number
 * ]} Transform.Matrix
 */