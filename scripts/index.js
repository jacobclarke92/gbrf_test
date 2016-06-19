import $ from 'jquery'
import PIXI, { Container, Sprite, Graphics, Text, BaseTexture, Texture, loader as Loader } from 'pixi.js'
import dat from 'dat-gui'
import _throttle from 'lodash.throttle'
import _get from 'lodash.get'
import Point from './Point'

const fishFiles = ['fish1.png','fish2.png','fish3.png','fish4.png','fish5.png','fish6.png','fish7.png','fish8.png','fish9.png','fish10.png','fish11.png','fish12.png'];

const vars = {
	bgColor: '#175282',
	numFishies: 100,
	fishScale: 0.25,
	showShark: true,
	sharkScale: 0.5,
	desiredSeparation: 20, //px
	offscreen: 35, //px
	preferOwnSpecies: true,

	waterEffect: false,
	waterIntensity: 30,
	waterSpeed: 4,
	bubbleProbability: 0.02,
	bubbleSize: 0.06,

	maxSpeed: 8,
	maxForce: 0.15,
	seperationMultiple: 40,
	alignmentMultiple: 0.4,
	cohesionMultiple: 1.6,
	focusCohesionMultiple: 6,
	forwardMovementMultiple: 0.035,
	sharkFearMultiple: 400,
	sharkFearRadius: 250, //px
	sharkHungerMultiple: 6,
	sharkForwardMovementMultiple: 1,
	sharkMaxSpeed: 12,

	globalSpeedMultiple: 0.5,
	focusOscillationSpeed: 0.02,
	rotationEase: 6, // lower is less
	
	zoneSize: 100,
	showZones: false,
	zoneCalcThrottle: 8, //every nth frame
};

let gui = null;
let $fishiesContainer = null;
let animating = true;
let canvas = null;
let renderer = null;
let stage = null;
let displacementSprite = null;
let displacementFilter = null;
let bubbleTexture = null;
let sharkSprite = null;

let width = null;
let height = null;
let resolution = null;
let scroll = 0;
let scrollOffset = 0;

let $currentFocus = null;
let currentFocusBounds = null;

const PI = Math.PI;
const PI2 = PI*2;

const fishSprites = [];
const fishies = [];
const bubbles = [];
const sharks = [];
const zones = [];

let zoneCalcThrottleCount = vars.zoneCalcThrottle;
const bubblesContainer = new Container();
const zonesContainer = new Container();
const zonesGraphic = new Graphics();
const velocitiesGraphic = new Graphics();
zonesContainer.addChild(zonesGraphic);
zonesContainer.addChild(velocitiesGraphic);
let focusOscillation = 0;

export function init() {
	$(document).ready(() => {

		// init dat GUI
		gui = new dat.GUI();
		const guiGeneral = gui.addFolder('General');
		guiGeneral.add(vars, 'bgColor');
		guiGeneral.add(vars, 'offscreen', 0, 500);
		const guiWater = gui.addFolder('Water');
		guiWater.add(vars, 'waterEffect');
		guiWater.add(vars, 'waterIntensity', 0, 200);
		guiWater.add(vars, 'waterSpeed', 0, 10);
		guiWater.add(vars, 'bubbleProbability', 0, 0.1);
		guiWater.add(vars, 'bubbleSize', 0.01, 0.5);
		const guiFlocking = gui.addFolder('Fishies');
		guiFlocking.add(vars, 'preferOwnSpecies');
		guiFlocking.add(vars, 'numFishies', 1, 750).step(1);
		guiFlocking.add(vars, 'fishScale', 0.05, 2);
		guiFlocking.add(vars, 'maxSpeed', 0.5, 50);
		guiFlocking.add(vars, 'maxForce', 0.05, 5);
		guiFlocking.add(vars, 'desiredSeparation', 0, 500);
		guiFlocking.add(vars, 'seperationMultiple', 1, 100);
		guiFlocking.add(vars, 'alignmentMultiple', 0.01, 3);
		guiFlocking.add(vars, 'cohesionMultiple', 0.05, 10);
		guiFlocking.add(vars, 'forwardMovementMultiple', 0, 0.1);
		guiFlocking.add(vars, 'focusCohesionMultiple', 0.05, 10);
		guiFlocking.add(vars, 'sharkFearMultiple', 0.05, 1000);
		guiFlocking.add(vars, 'globalSpeedMultiple', 0.01, 10);
		guiFlocking.add(vars, 'focusOscillationSpeed', 0.001, 0.5);
		guiFlocking.add(vars, 'rotationEase', 1, 100);
		const guiShark = gui.addFolder('Shark');
		guiShark.add(vars, 'showShark');
		guiShark.add(vars, 'sharkScale', 0.05, 2);
		guiShark.add(vars, 'sharkHungerMultiple', 0.05, 6);
		guiShark.add(vars, 'sharkForwardMovementMultiple', 0.05, 6);
		guiShark.add(vars, 'sharkMaxSpeed', 0.05, 20);
		const guiZones = gui.addFolder('Zoning');
		guiZones.add(vars, 'showZones');
		guiZones.add(vars, 'zoneSize', 10, 1000);
		guiZones.add(vars, 'zoneCalcThrottle', 1, 60);


		// init renderer, stage, etc.
		$fishiesContainer = $('#fishies_bg');
		width = $fishiesContainer.width();
		height = $fishiesContainer.height();
		resolution = window.devicePixelRatio || 1;

		renderer = new PIXI.autoDetectRenderer(width, height, {
		// renderer = new PIXI.CanvasRenderer(width, height, {
			resolution, 
			transparent: false,
			backgroundColor: eval('0x'+vars.bgColor.substring(1)),
		});
		canvas = renderer.view;
		$fishiesContainer[0].appendChild(canvas);
		stage = new Container();


		// init window event bindings
		$(window).resize(rendererResize);
		$(window).on('focus', () => rendererResize());
		rendererResize();

		$(document).scroll(updateScroll);
		updateScroll();


		// init focus state event binding
		$('[data-fish-focus]').focus(function() {
			$currentFocus = $(this);
			updateCurrentFocusBounds();
		});
		$('[data-fish-focus]').blur(function() {
			$currentFocus = null;
			currentFocusBounds = null;
		});

		// init asset loader
		Loader.on('progress', handleLoaderProgress);
		Loader.once('complete', handleLoaderComplete);

		for(let fish of fishFiles) {
			Loader.add(fish.split('.')[0], 'assets/'+fish);
		}

		Loader.add('shark', 'assets/shark.png');
		Loader.add('bubble', 'assets/bubble.png');
		Loader.add('displacement_map', 'assets/displacement_map.png');

		Loader.load();

	});
}

// thottles scroll events to 60fps
const updateScroll = _throttle(() => {
	const newScroll = $(document).scrollTop();
	scrollOffset += scroll-newScroll;
	scroll = newScroll;
	updateCurrentFocusBounds();
}, 1000/60);

function updateCurrentFocusBounds() {
	if(!$currentFocus) return;
	const offset = $currentFocus.offset();
	currentFocusBounds = {
		width: $currentFocus.width(), 
		height: $currentFocus.height(), 
		left: offset.left, 
		top: offset.top - scroll
	};
	currentFocusBounds.right = currentFocusBounds.left + currentFocusBounds.width;
	currentFocusBounds.bottom = currentFocusBounds.top + currentFocusBounds.height;
	focusOscillation = 0;
}

function rendererResize() {
	width = $fishiesContainer.width();
	height = $fishiesContainer.height();
	canvas.style.width = width + 'px';
	canvas.style.height = height + 'px';
	renderer.resize(width, height);
}

function handleLoaderProgress(loader, resource) {
	const progress = Math.floor(loader.progress);
	console.log('Loading... '+progress);
}

function handleLoaderComplete(loader, resources) {
	console.log('Loading Complete');

	Object.keys(resources).map(key => {
		switch(key) {
			case 'bubble':
				bubbleTexture = resources[key].texture;
				break;
			case 'displacement_map':
				displacementSprite = new Sprite(resources[key].texture);
				displacementFilter = new PIXI.filters.DisplacementFilter(displacementSprite);
				displacementFilter.scale.x = displacementFilter.scale.y = vars.waterIntensity;
				break;
			case 'shark':
				sharkSprite = new Sprite(resources[key].texture);	
				sharkSprite.anchor = {x: 0.3, y: 0.8};			
				sharkSprite.position.x = Math.random()*width;
				sharkSprite.position.y = Math.random()*height;
				sharkSprite.rotation = Math.random()*Math.PI*2;
				sharkSprite.scale = new Point(-	vars.sharkScale, vars.sharkScale);
				sharkSprite.acceleration = new Point();
				sharkSprite.velocity = new Point(Math.cos(sharkSprite.rotation), Math.sin(sharkSprite.rotation));
				sharks.push(sharkSprite);
				break;
			default:
				const fishSprite = new Sprite(resources[key].texture);
				fishSprite.key = key;
				fishSprites.push(fishSprite);
				break;
		}
	});

	initScene();
}

function initScene() {

	stage.addChild(zonesContainer);
	stage.addChild(bubblesContainer);

	// generate all fish sprites from the loaded images
	for(let i=0; i < vars.numFishies; i ++) {
		const fishSprite = initFish(i);
		stage.addChild(fishSprite);
		fishies.push(fishSprite);
	}

	animate();

}

function initFish(i) {
	const fishSprite = new Sprite();
	fishSprite.key = i;
	fishSprite.type = i%fishSprites.length;
	fishSprite.texture = fishSprites[i%fishSprites.length].texture;
	fishSprite.anchor = new Point(0.25, 0.5);
	fishSprite.position.x = Math.random()*width;
	fishSprite.position.y = Math.random()*height;
	fishSprite.rotation = Math.random()*Math.PI*2;
	fishSprite.scale = new Point(-vars.fishScale, vars.fishScale);
	fishSprite.acceleration = new Point();
	fishSprite.velocity = new Point(Math.cos(fishSprite.rotation), Math.sin(fishSprite.rotation));
	fishSprite.buttonMode = true;
	fishSprite.interactive = true;
	fishSprite.on('mouseover', () => fishSprite.over = true);
	fishSprite.on('mouseout', () => fishSprite.over = false);
	return fishSprite;
}

function animate() {

	displacementFilter.scale.x = displacementFilter.scale.y = vars.waterIntensity;
	displacementSprite.anchor.x = displacementSprite.anchor.y += vars.waterSpeed/1000;
	stage.filters = vars.waterEffect ? [displacementFilter] : null;

	// calculate zones
	if(++zoneCalcThrottleCount >= vars.zoneCalcThrottle) {
		zoneCalcThrottleCount = 0;

		// maintain correct amount of fish
		const excess = fishies.length - vars.numFishies; 
		if(excess > 0) {
			for(let i=0; i<excess; i++) {
				const fishSprite = fishies[fishies.length-1-excess+i];
				stage.removeChild(fishSprite);
				fishies.splice(fishies.indexOf(fishSprite), 1);
			}
		}else if(excess < 0) {
			for(let i=0; i<Math.abs(excess); i++) {
				const fishSprite = initFish(fishies.length+i);
				stage.addChild(fishSprite);
				fishies.push(fishSprite);
			}
		}

		// reset debug labels etc.
		(zonesContainer.labels || []).map(label => zonesContainer.removeChild(label));
		zonesContainer.labels = [];
		zonesGraphic.clear();
		zonesGraphic.lineStyle(2, 0xFFFFFF, 0.5);
		
		for(let row = 0; row < height/vars.zoneSize; row ++) {
			const zoneY = row*vars.zoneSize;
			zones[row] = [];

			// draw row quadrant
			if(vars.showZones) {
				zonesGraphic.moveTo(0, zoneY);
				zonesGraphic.lineTo(width, zoneY);
			}

			for(let col = 0; col < width/vars.zoneSize; col ++) {
				const zoneX = col*vars.zoneSize;
				
				// draw column quadrant
				if(vars.showZones) {
					zonesGraphic.moveTo(zoneX, 0);
					zonesGraphic.lineTo(zoneX, height);
				}

				// update quadrant info
				const children = [...fishies, ...sharks].filter(fish => 
					fish.position.x > zoneX && 
					fish.position.x < zoneX+vars.zoneSize && 
					fish.position.y > zoneY && 
					fish.position.y < zoneY+vars.zoneSize
				);
				const count = children.length;
				const center = children.reduce((point, current) => point.add({x: current.position.x/count, y: current.position.y/count}), new Point());
				zones[row][col] = {row, col, children, center, count};

				for(let fish of children) {
					fish.zone = [row, col];
				}

				// display labels
				if(vars.showZones) {
					const label = new Text(children.length+' fishies', {font: '12px sans-serif', fill: 0xFFFFFF});
					label.position = new Point(zoneX+10, zoneY+10);
					zonesContainer.addChild(label);
					zonesContainer.labels.push(label);

					const pt = new Graphics();
					pt.beginFill(0xFFFFFF);
					pt.drawCircle(0, 0, 10);
					pt.position = center;
					zonesContainer.addChild(pt);
					zonesContainer.labels.push(pt);
				}
			}
		}

		// show neighbouring fish if hovering
		if(vars.showZones) {
			for(let fish of fishies) {
				if(fish.over) {
					const surroundingFishies = getSurroundingFishies(fish.zone);
					const nearGraphic = new Graphics();
					nearGraphic.lineStyle(1, 0xFFFFFF, 0.5);
					for(let friend of surroundingFishies) {
						nearGraphic.moveTo(fish.position.x, fish.position.y);
						nearGraphic.lineTo(friend.position.x, friend.position.y);
					}
					zonesContainer.addChild(nearGraphic);
					zonesContainer.labels.push(nearGraphic);
				}
			}
		}
	}


	for(let bubble of bubbles) {
		bubble.position.y -= (height - bubble.position.y)/70;
		bubble.position.y += scrollOffset;
		if(bubble.position.y < -vars.offscreen) {
			bubblesContainer.removeChild(bubble);
			bubbles.splice(bubbles.indexOf(bubble), 1);
		}
	}

	if(vars.showShark) {
		if(stage.children.indexOf(sharkSprite) < 0) stage.addChild(sharkSprite);
		for(let shark of sharks) {

			// if(shark.position.x < -vars.offscreen) shark.position.x = width + vars.offscreen;
			// if(shark.position.x > width+vars.offscreen) shark.position.x = -vars.offscreen;
			// if(shark.position.y < -vars.offscreen) shark.position.y = height + vars.offscreen - (-vars.offscreen - shark.position.y);
			// if(shark.position.y > height+vars.offscreen) shark.position.y = -vars.offscreen - (height+vars.offscreen - shark.position.y);

			shark.position.y += scrollOffset;
			
			// const surroundingFishies = getSurroundingFishies(shark.zone);
			const cohesionForce = cohesion(shark, fishies, true);
			const forwardMovementForce = new Point(Math.cos(shark.rotation), Math.sin(shark.rotation));
			cohesionForce.multiply(vars.sharkHungerMultiple);
			forwardMovementForce.multiply(vars.sharkForwardMovementMultiple);
			shark.acceleration.add(cohesionForce, forwardMovementForce);
			shark.velocity.add(shark.acceleration);
			shark.velocity.limit(vars.sharkMaxSpeed);

			// reposition shark
			shark.position.x += shark.velocity.x * vars.globalSpeedMultiple;
			shark.position.y += shark.velocity.y * vars.globalSpeedMultiple;

			// reset acceleration each frame
			shark.acceleration.multiply(0);

			// ease to correct rotation
			shark.aimRotation = Math.atan2(shark.velocity.y, shark.velocity.x);
			if(shark.aimRotation < 0) shark.aimRotation += PI2;
			let diff = shark.aimRotation - shark.rotation;
			if(diff > PI) diff -= PI2;
			if(diff < -PI) diff += PI2;
			shark.rotation += diff/vars.rotationEase;

			// keep upright
			const absRotation = (shark.rotation%PI2);
			shark.scale.y = (absRotation > PI/2 && absRotation < PI*1.5) ? -vars.sharkScale : vars.sharkScale;

		}
	}else{
		if(stage.children.indexOf(sharkSprite) > -1) stage.removeChild(sharkSprite);
	}


	if(vars.showZones) velocitiesGraphic.clear();
	focusOscillation += vars.focusOscillationSpeed;

	// iterate over the fishies!
	for(let fish of fishies) {

		// keep in bounds
		if(fish.position.x < -vars.offscreen) {
			fish.position.x = width + vars.offscreen;
			fish.position.y = Math.round(Math.random()*height);
		}
		if(fish.position.x > width+vars.offscreen) {
			fish.position.x = -vars.offscreen;
			fish.position.y = Math.round(Math.random()*height);
		}
		if(fish.position.y < -vars.offscreen) {
			fish.position.y = height + vars.offscreen - (-vars.offscreen - fish.position.y);
			fish.position.x = Math.round(Math.random()*width); // randomize x position
		}
		if(fish.position.y > height+vars.offscreen) {
			fish.position.y = -vars.offscreen - (height+vars.offscreen - fish.position.y);
			fish.position.x = Math.round(Math.random()*width); // randomize x position
		}

		fish.position.y += scrollOffset;
		 
		// calculate flocking forces
		const surroundingFishies = getSurroundingFishies(fish.zone);
		const seperationForce = seperation(fish, surroundingFishies);
		const sharkFearForce = seperation(fish, sharks, true);
		const cohesionForce = cohesion(fish, surroundingFishies);
		const alignmentForce = alignment(fish, surroundingFishies);
		const currentFocusForce = focusCohesion(fish);
		const forwardMovementForce = new Point(Math.cos(fish.rotation), Math.sin(fish.rotation));

		// weight each force
		sharkFearForce.multiply(vars.sharkFearMultiple);
		seperationForce.multiply(vars.seperationMultiple);
		cohesionForce.multiply(vars.cohesionMultiple);
		alignmentForce.multiply(vars.alignmentMultiple);
		currentFocusForce.multiply(vars.focusCohesionMultiple);
		forwardMovementForce.multiply(vars.forwardMovementMultiple*(surroundingFishies.length/4));

		// adjust fish velocity
		fish.acceleration.add(
			sharkFearForce,
			seperationForce, 
			cohesionForce, 
			alignmentForce, 
			currentFocusForce, 
			forwardMovementForce
		);
		fish.velocity.add(fish.acceleration);
		fish.velocity.limit(vars.maxSpeed);

		// reposition fish
		fish.position.x += fish.velocity.x * vars.globalSpeedMultiple;
		fish.position.y += fish.velocity.y * vars.globalSpeedMultiple;

		// reset acceleration each frame
		fish.acceleration.multiply(0);

		// ease to correct rotation
		fish.aimRotation = Math.atan2(fish.velocity.y, fish.velocity.x);
		if(fish.aimRotation < 0) fish.aimRotation += PI2;
		let diff = fish.aimRotation - fish.rotation;
		if(diff > PI) diff -= PI2;
		if(diff < -PI) diff += PI2;
		fish.rotation += diff/vars.rotationEase;

		// keep upright
		const absRotation = (fish.rotation%PI2);
		fish.scale.y = (absRotation > PI/2 && absRotation < PI*1.5) ? -vars.fishScale : vars.fishScale;


		// maybe blow a bubble
		if(Math.random() < vars.bubbleProbability) {
			const bubble = new Sprite(bubbleTexture);
			bubble.scale.set(vars.bubbleSize);
			bubble.position = {x: fish.position.x, y: fish.position.y};
			bubblesContainer.addChild(bubble);
			bubbles.push(bubble);
		}

		if(vars.showZones) {
			const seperationAngle = Math.atan2(seperationForce.y, seperationForce.x);
			const cohesionAngle = Math.atan2(cohesionForce.y, cohesionForce.x);
			const alignmentAngle = Math.atan2(alignmentForce.y, alignmentForce.x);
			if(seperationForce.x !== 0 && seperationForce.y !== 0) {
				velocitiesGraphic.lineStyle(3, 0xFF0000, 0.5);
				velocitiesGraphic.moveTo(fish.position.x, fish.position.y);
				velocitiesGraphic.lineTo(fish.position.x + Math.cos(seperationAngle)*30, fish.position.y + Math.sin(seperationAngle)*30);
			}
			velocitiesGraphic.lineStyle(3, 0xe4c524, 1);
			velocitiesGraphic.moveTo(fish.position.x, fish.position.y);
			velocitiesGraphic.lineTo(fish.position.x + Math.cos(alignmentAngle)*30, fish.position.y + Math.sin(alignmentAngle)*30);
			velocitiesGraphic.lineStyle(3, 0x00FF00, 0.5);
			velocitiesGraphic.moveTo(fish.position.x, fish.position.y);
			velocitiesGraphic.lineTo(fish.position.x + Math.cos(cohesionAngle)*30, fish.position.y + Math.sin(cohesionAngle)*30);
		}

	}
	scrollOffset = 0;

	renderer.render(stage);
	if(animating) window.requestAnimationFrame(animate);
}

function focusCohesion(fish) {
	const sum = new Point();
	if(!$currentFocus || currentFocusBounds.top < 0 || currentFocusBounds.bottom > height) return sum;

	const position = new Point(fish.position.x, fish.position.y);
	const focusPosition = new Point(
		currentFocusBounds.left + currentFocusBounds.width/2 + Math.cos(focusOscillation)*currentFocusBounds.width/2, 
		currentFocusBounds.top + currentFocusBounds.height/2
	);
	const dist = position.distance(focusPosition);
	sum.add(focusPosition);
	return seek(fish, sum);
}

/*
 * Below functions loosely based on Flocking by Daniel Shiffman 
 * https://processing.org/examples/flocking.html
 */

// calcuates the seperation velocity based on surrounding fish
function seperation(fish, surroundingFishies, isShark = false) {
	const desiredSeparation = isShark ? vars.sharkFearRadius : vars.desiredSeparation;
	const steer = new Point();
	for(let friend of surroundingFishies) {
		const position = new Point(fish.position.x, fish.position.y);
		const dist = position.distance(friend.position);
		let count = 0;
		if(dist > 0 && dist < desiredSeparation) {
			count ++;
			const diff = position.subtract(friend.position);
			diff.normalize();
			diff.divide(dist);
			steer.add(diff);
		}
		if(count > 0) {
			steer.divide(count);
		}
	}
	return steer;
}

// calcuates the alignment velocity based on surrounding fish
function alignment(fish, surroundingFishies = []) {
	
	// uncommenting this steers fish towards the most densely packed quadrant rather than all surrounding quadrants
	// const surroundingZones = getSurroundingZones(fish.zone);
	// if(!surroundingZones.length) return new Point();
	// surroundingZones.sort((a,b) => a.count > b.count ? -1 : (a.count < b.count ? 1 : 0));
	// surroundingFishies = surroundingZones[0].children;
	
	const sum = new Point();
	let count = 0;
	for(let friend of surroundingFishies) {
		if(!vars.preferOwnSpecies || (vars.preferOwnSpecies && friend.type === fish.type)) {
			const position = new Point(fish.position.x, fish.position.y);
			const dist = position.distance(friend.position);
			if(dist > 0) {
				sum.add(friend.velocity);
				count ++;
			}
		}
	}
	if(count === 0) return new Point();

	sum.normalize();
	sum.divide(vars.maxSpeed);
	const steer = sum.subtract(fish.velocity);
	steer.limit(vars.maxForce);
	return steer;
}

// calcuates the cohesion velocity based on surrounding fish
function cohesion(fish, surroundingFishies, isShark = false) {
	const sum = new Point();
	let count = 0;
	for(let friend of surroundingFishies) {
		if(isShark || !vars.preferOwnSpecies || (vars.preferOwnSpecies && friend.type === fish.type)) {
			const position = new Point(fish.position.x, fish.position.y);
			const dist = position.distance(friend.position);
			if(dist > 0) {
				sum.add(friend.position);
				count ++;
			}
		}
	}
	if(count === 0) return new Point();
	sum.divide(count);
	return seek(fish, sum);
}

// calculates and applies a steering force towards a target
function seek(fish, target) {
	const desired = target.subtract(fish.position);
	desired.normalize();
	desired.multiply(vars.maxSpeed);
	const steer = desired.subtract(fish.velocity);
	steer.limit(vars.maxForce);
	return steer;
}

// ended up being unused but could be useful
function getSurroundingZones(zone) {
	const surroundingZones = [
		_get(zones, '['+(zone[0]-1)+']['+(zone[1]-1)+']', null), // TL
		_get(zones, '['+(zone[0]-1)+']['+(zone[1]+0)+']', null), // ML
		_get(zones, '['+(zone[0]-1)+']['+(zone[1]+1)+']', null), // BL
		_get(zones, '['+(zone[0]+0)+']['+(zone[1]-1)+']', null), // TM
		_get(zones, '['+(zone[0]+0)+']['+(zone[1]+0)+']', null), // MM
		_get(zones, '['+(zone[0]+0)+']['+(zone[1]+1)+']', null), // BM
		_get(zones, '['+(zone[0]+1)+']['+(zone[1]-1)+']', null), // TR
		_get(zones, '['+(zone[0]+1)+']['+(zone[1]+0)+']', null), // MR
		_get(zones, '['+(zone[0]+1)+']['+(zone[1]+1)+']', null), // BR
	];
	return surroundingZones.filter(zone => zone !== null);
}

// gets surrounding fish from a quadrant
function getSurroundingFishies(zone) {
	return [
		..._get(zones, '['+(zone[0]-1)+']['+(zone[1]-1)+'].children', []), // TL
		..._get(zones, '['+(zone[0]-1)+']['+(zone[1]+0)+'].children', []), // ML
		..._get(zones, '['+(zone[0]-1)+']['+(zone[1]+1)+'].children', []), // BL
		..._get(zones, '['+(zone[0]+0)+']['+(zone[1]-1)+'].children', []), // TM
		..._get(zones, '['+(zone[0]+0)+']['+(zone[1]+0)+'].children', []), // MM
		..._get(zones, '['+(zone[0]+0)+']['+(zone[1]+1)+'].children', []), // BM
		..._get(zones, '['+(zone[0]+1)+']['+(zone[1]-1)+'].children', []), // TR
		..._get(zones, '['+(zone[0]+1)+']['+(zone[1]+0)+'].children', []), // MR
		..._get(zones, '['+(zone[0]+1)+']['+(zone[1]+1)+'].children', []), // BR
	];
}


init();