export default class Point {
	
	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
		return this;
	}

	abs() {
		this.x = Math.abs(this.x);
		this.y = Math.abs(this.y);
		return this;
	}

	add(/* point1, point2, ... */) {
		if(arguments.length === 1 && typeof arguments[0] == 'number') {
			this.x += arguments[0];
			this.y += arguments[0];
		}else{
			// not using a for of loop because ie11
			for(let a=0; a<arguments.length; a++) {
				this.x += arguments[a].x;
				this.y += arguments[a].y;
			}
		}
		return this;
	}

	subtract(/* point1, point2, ... */) {
		if(arguments.length === 1 && typeof arguments[0] == 'number') {
			this.x -= arguments[0];
			this.y -= arguments[0];
		}else{
			// not using a for of loop because ie11
			for(let a=0; a<arguments.length; a++) {
				this.x -= arguments[a].x;
				this.y -= arguments[a].y;
			}
		}
		return this;
	}

	multiply(point) {
		if(typeof point == 'number') {
			this.x *= point;
			this.y *= point;
		}else{
			this.x *= point.x;
			this.y *= point.y;
		}
		return this;
	}

	divide(point) {
		if(typeof point == 'number') {
			this.x /= point;
			this.y /= point;
		}else{
			this.x /= point.x;
			this.y /= point.y;
		}
		return this;
	}

	distance(point) {
		return Math.sqrt(Math.pow(point.x - this.x, 2) + Math.pow(point.y - this.y, 2));
	}

	normalize(scale = 1) {
		const norm = Math.sqrt(this.x*this.x + this.y*this.y);
		if(norm !== 0) {
			this.x = scale * this.x / norm;
			this.y = scale * this.y / norm;
		}
		return this;
	}

	limit(max) {
		if(this.x*this.x + this.y*this.y > max*max) {
			this.normalize();
			this.multiply(max);
		}
		return this;
	}

}