import $ from 'jquery'
import PIXI, { Container, Sprite, Graphics, Text, BaseTexture, Texture, loader as Loader } from 'pixi.js'
import dat from 'dat-gui'
import _throttle from 'lodash/throttle'
import _get from 'lodash/get'
import Point from './Point'

// const fishFiles = ['fish1.png','fish2.png','fish3.png','fish4.png','fish5.png','fish6.png','fish7.png','fish8.png','fish9.png','fish10.png','fish11.png'];
const fishFiles = [/*'fish1.png','fish2.png',*/'fish3.png','fish4.png',/*'fish5.png','fish6.png','fish7.png',*/'fish8.png','fish9.png','fish10.png'/*,'fish11.png'*/];

const vars = {
	bgColor: '#175282',
	numFishies: 50,
	fishScale: 0.25,
	offscreen: 100, //px
	sharkOffscreen: 450, //px
	bendPoints: 20,
	preferOwnSpecies: true,

	waterEffect: false,
	waterIntensity: 30,
	waterSpeed: 5,
	bubbleSize: 0.06,
	bubbleProbability: 0.01,
	sharkBubbleProbability: 0.05,

	maxSpeed: 7.5,
	maxForce: 0.15,
	fishTailSpeed: 0.35,
	fishTailMovement: 0.75,
	desiredSeparation: 30, //px
	seperationMultiple: 200,
	alignmentMultiple: 0.6,
	cohesionMultiple: 1.6,
	focusCohesionMultiple: 8,
	forwardMovementMultiple: 0.2,

	showShark: true,
	sharkScale: 0.75,
	sharkFearMultiple: -10,
	sharkFearRadius: 250, //px
	sharkHungerMultiple: 2,
	sharkForwardMovementMultiple: 15,
	sharkMaxSpeed: 5,
	sharkTailSpeed: 0.05,
	sharkTailMovement: 0.5,
	sharpSpineOffsetY: 40, //px

	globalSpeedMultiple: 0.5,
	focusOscillationSpeed: 0.03,
	rotationEase: 8, // lower is less
	
	zoneSize: 160,
	showZones: false,
	zoneCalcThrottle: 10, //every nth frame
};

const showGui = true;
let gui = null;
let fishiesInstances = [];

let animating = true;
let bubbleTexture = null;
let flipperTexture1 = null;
let flipperTexture2 = null;

let parallax = 1;
let resolution = null;
let scroll = 0;
let scrollOffset = 0;
let windowHeight = 500;

let $currentFocus = null;
let currentFocusBounds = null;

const PI = Math.PI;
const PI2 = PI*2;

const fishSprites = [];
const fishies = [];
const bubbles = [];
const sharks = [];
const zones = [];
const fishWidth = 250;
const sharkWidth = 490;

let zoneCalcThrottleCount = vars.zoneCalcThrottle;
let focusOscillation = 0;


const displacementImage = new Image();
let displacementTexture = null;
displacementImage.onload = function() {
	displacementTexture = new Texture(new BaseTexture(displacementImage));
	init();
}

export function init() {
	$(document).ready(() => {

		resolution = window.devicePixelRatio || 1;
		$(document).scroll(updateScroll);
		updateScroll();

		$('[data-fishies]').each((i, elem) => {
			const $elem = $(elem);
			// $elem.css('background', 'none');
			$elem.append($('<div id="fishies_bg" class="fishies"></div>'));
			const $container = $elem.find('#fishies_bg');
			const width = $elem.width();
			const height = $elem.height();
			const offset = $container[0].getBoundingClientRect();
			const renderer = new PIXI.autoDetectRenderer(width, height, {
				resolution, 
				transparent: true,
				backgroundColor: eval('0x'+vars.bgColor.substring(1)),
			});
			const canvas = renderer.view;
			$container[0].appendChild(canvas);
			const masterStage = new Container();
			const stage = new Container();
			const bubblesContainer = new Container();
			const fishiesContainer = new Container();
			const sharksContainer = new Container();
			const zonesContainer = new Container();
			const zonesGraphic = new Graphics();
			const velocitiesGraphic = new Graphics();
			const displacementSprite = new Sprite(displacementTexture, 1);
			const displacementFilter = new PIXI.filters.DisplacementFilter(displacementSprite);
			displacementFilter.scale.x = displacementFilter.scale.y = vars.waterIntensity;
			fishiesInstances.push({
				animating: false,
				$elem,
				$container,
				width,
				height,
				left: offset.left,
				top: offset.top,
				renderer,
				canvas,
				stage,
				masterStage,
				displacementSprite,
				displacementFilter,
				fishSprites: [],
				fishies: [],
				fishiesContainer,
				bubbles: [],
				bubblesContainer, 
				sharks: [],
				sharksContainer,
				sharkSprite: null,
				zones: [],
				zonesContainer,
				zonesGraphic,
				velocitiesGraphic,
			})
		});

		// init window event bindings
		$(window).resize(rendererResize);
		$(window).on('focus', () => rendererResize());
		rendererResize();


		// init focus state event binding
		$('[data-fish-focus]').focus(function() {
			$currentFocus = $(this);
			updateCurrentFocusBounds();
		});
		$('[data-fish-focus]').blur(function() {
			$currentFocus = null;
			currentFocusBounds = null;
		});
		$('[data-fish-hover]').on('mouseover', function() {
			$currentFocus = $(this);
			updateCurrentFocusBounds();
		});
		$('[data-fish-hover]').on('mouseout', function() {
			$currentFocus = null;
			currentFocusBounds = null;
		});


		// init dat GUI
		if(showGui) {
			gui = new dat.GUI();
			const guiGeneral = gui.addFolder('General');
			guiGeneral.addColor(vars, 'bgColor').onChange(color => renderer.backgroundColor = eval('0x'+color.substring(1)));
			guiGeneral.add(vars, 'offscreen', 0, 500);
			const guiWater = gui.addFolder('Water');
			guiWater.add(vars, 'waterEffect');
			guiWater.add(vars, 'waterIntensity', 0, 200);
			guiWater.add(vars, 'waterSpeed', 0, 10);
			guiWater.add(vars, 'bubbleProbability', 0, 0.1);
			guiWater.add(vars, 'bubbleSize', 0.01, 0.5);
			const guiFishies = gui.addFolder('Fishies');
			guiFishies.add(vars, 'preferOwnSpecies');
			guiFishies.add(vars, 'numFishies', 1, 750).step(1);
			guiFishies.add(vars, 'fishScale', 0.05, 2);
			guiFishies.add(vars, 'maxSpeed', 0.5, 50);
			guiFishies.add(vars, 'maxForce', 0.05, 5);
			guiFishies.add(vars, 'desiredSeparation', 0, 500);
			guiFishies.add(vars, 'seperationMultiple', 1, 100);
			guiFishies.add(vars, 'alignmentMultiple', 0.01, 3);
			guiFishies.add(vars, 'cohesionMultiple', 0.05, 10);
			guiFishies.add(vars, 'forwardMovementMultiple', 0, 0.1);
			guiFishies.add(vars, 'focusCohesionMultiple', 0.05, 10);
			guiFishies.add(vars, 'sharkFearMultiple', 0.05, 1000);
			guiFishies.add(vars, 'globalSpeedMultiple', 0.01, 10);
			guiFishies.add(vars, 'focusOscillationSpeed', 0.001, 0.5);
			guiFishies.add(vars, 'fishTailSpeed', 0.005, 1);
			guiFishies.add(vars, 'fishTailMovement', 0.001, 1.5);
			guiFishies.add(vars, 'rotationEase', 1, 100);
			const guiShark = gui.addFolder('Shark');
			guiShark.add(vars, 'showShark');
			guiShark.add(vars, 'sharkScale', 0.05, 2);
			guiShark.add(vars, 'sharkHungerMultiple', 0.05, 6);
			guiShark.add(vars, 'sharkForwardMovementMultiple', 0.05, 6);
			guiShark.add(vars, 'sharkMaxSpeed', 0.05, 20);
			guiShark.add(vars, 'sharkTailSpeed', 0.005, 1);
			guiShark.add(vars, 'sharkTailMovement', 0.001, 1.5);
			const guiZones = gui.addFolder('Zoning');
			guiZones.add(vars, 'showZones');
			guiZones.add(vars, 'zoneSize', 10, 1000);
			guiZones.add(vars, 'zoneCalcThrottle', 1, 60);
			gui.remember(vars);
			gui.close();
		}


		// init asset loader
		Loader.on('progress', handleLoaderProgress);
		Loader.once('complete', handleLoaderComplete);


		for(let f = 0; f < fishFiles.length; f++) {
			Loader.add(fishFiles[f].split('.')[0], '/assets/'+fishFiles[f]);
		}

		Loader.add('shark', '/assets/shark.png');
		Loader.add('bubble', '/assets/bubble.png');
		Loader.add('flipper1', '/assets/flipper1.png');
		Loader.add('flipper2', '/assets/flipper2.png');

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
	if($currentFocus) {
		const offset = $currentFocus[0].getBoundingClientRect();
		currentFocusBounds = {
			width: $currentFocus.width(), 
			height: $currentFocus.height(), 
			left: offset.left, 
			top: offset.top
		};
		currentFocusBounds.right = currentFocusBounds.left + currentFocusBounds.width;
		currentFocusBounds.bottom = currentFocusBounds.top + currentFocusBounds.height;
	}
	for(let n = 0; n < fishiesInstances.length; n ++) { 
		const instance = fishiesInstances[n];
		const offset = instance.$container[0].getBoundingClientRect();
		instance.left = offset.left;
		instance.top = offset.top;
	}
	focusOscillation = 0;
}

function rendererResize() {
	windowHeight = $(window).height();
	for(let n = 0; n < fishiesInstances.length; n ++) { 
		const instance = fishiesInstances[n];
		const offset = instance.$container.offset();
		instance.width = instance.$container.width();
		instance.height = instance.$container.height();
		instance.left = offset.left;
		instance.top = offset.top;
		instance.renderer.resize(instance.width, instance.height);
		instance.canvas.style.width = instance.width + 'px';
		instance.canvas.style.height = instance.height + 'px';
	}
	updateCurrentFocusBounds();
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
			case 'shark':
				for(let n = 0; n < fishiesInstances.length; n ++) { 
					const instance = fishiesInstances[n];
					const bendPoints = [];
					for(let i=0; i < vars.bendPoints; i++) {
						bendPoints.push(new Point(i*(sharkWidth/vars.bendPoints), vars.sharpSpineOffsetY));
					}
					instance.shark = new Container();
					instance.sharkSprite = new PIXI.mesh.Rope(resources[key].texture, bendPoints);	
					instance.sharkSprite.bendPoints = bendPoints;
					instance.shark.anchor = {x: 0.5, y: 0.4};			
					instance.shark.position.x = Math.random()*instance.width;
					instance.shark.position.y = Math.random()*instance.height;
					instance.shark.rotation = Math.random()*Math.PI*2;
					instance.shark.rotationCount = 0;
					instance.shark.scale = new Point(-vars.sharkScale, vars.sharkScale*2);
					instance.shark.acceleration = new Point();
					instance.shark.velocity = new Point(Math.cos(instance.sharkSprite.rotation), Math.sin(instance.sharkSprite.rotation));
					instance.sharks.push(instance.shark);
				}
				break;
			case 'flipper1':
				flipperTexture1 = resources[key].texture;
				break;
			case 'flipper2':
				flipperTexture2 = resources[key].texture;
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

	for(let n = 0; n < fishiesInstances.length; n ++) { 
		const instance = fishiesInstances[n];
		instance.masterStage.addChild(instance.stage);
		instance.zonesContainer.addChild(instance.zonesGraphic);
		instance.zonesContainer.addChild(instance.velocitiesGraphic);
		instance.stage.addChild(instance.zonesContainer);
		instance.stage.addChild(instance.bubblesContainer);
		instance.stage.addChild(instance.bubblesContainer);
		instance.stage.addChild(instance.sharksContainer);
		instance.stage.addChild(instance.fishiesContainer);
		if(vars.waterEffect) instance.stage.filters = [instance.displacementFilter];
		// instance.flipperSprite1 = new Sprite(flipperTexture1);
		// 
		const bendPoints = [];
		for(let i=0; i < vars.bendPoints; i++) {
			bendPoints.push(new Point(i*(200/vars.bendPoints), 0));
		}
		instance.flipperSprite1 = new PIXI.mesh.Rope(flipperTexture1, bendPoints);
		instance.flipperSprite1.bendPoints = bendPoints;
		instance.flipperSprite1.anchor = {x: 0.2, y: 0.22};
		instance.flipperSprite1.rotation = 0.6;
		instance.flipperSprite1.position.set(100, 80);
		instance.flipperSprite2 = new Sprite(flipperTexture2);
		instance.flipperSprite2.anchor.set(0.3, 0.2);
		instance.flipperSprite2.position.set(330, 95);
		instance.shark.addChild(instance.flipperSprite2);
		instance.shark.addChild(instance.sharkSprite);
		instance.shark.addChild(instance.flipperSprite1);

		$(instance.canvas).addClass('reveal');

		// generate all fish sprites from the loaded images
		for(let i=0; i < vars.numFishies; i ++) {
			const fishSprite = initFish(i, instance);
			fishSprite.rotation = (i < vars.numFishies/2) ? 0 : Math.PI;
			instance.fishiesContainer.addChild(fishSprite);
			instance.fishies.push(fishSprite);
		}

	}

	animate();

}

function initFish(i, instance) {
	const bendPoints = [];
	for(let i=0; i < vars.bendPoints; i++) {
		bendPoints.push(new Point(i*(fishWidth/vars.bendPoints), 0));
	}
	const fishSprite = new PIXI.mesh.Rope(fishSprites[i%fishSprites.length].texture, bendPoints);
	fishSprite.bendPoints = bendPoints;
	fishSprite.key = i;
	fishSprite.type = i%fishSprites.length;
	fishSprite.anchor = new Point(0.25, 0.5);
	fishSprite.position.x = Math.random()*instance.width;
	fishSprite.position.y = Math.random()*instance.height;
	fishSprite.rotation = Math.random()*Math.PI*2;
	fishSprite.scale.set(vars.fishScale);
	fishSprite.acceleration = new Point();
	fishSprite.velocity = new Point(Math.cos(fishSprite.rotation), Math.sin(fishSprite.rotation));
	fishSprite.rotationCount = 0;
	// fishSprite.buttonMode = true;
	// fishSprite.interactive = true;
	// fishSprite.on('mouseover', () => fishSprite.over = true);
	// fishSprite.on('mouseout', () => fishSprite.over = false);
	return fishSprite;
}

let sharkTail = 0;
let fishTail = 0;
let seperationOscillator = 0;
let desiredSeparation = vars.desiredSeparation;
function animate() {
	if(!animating) return;

	sharkTail += vars.sharkTailSpeed;
	fishTail += vars.fishTailSpeed;
	zoneCalcThrottleCount ++;
	seperationOscillator += 0.1;
	// desiredSeparation = vars.desiredSeparation + Math.cos(seperationOscillator)*(vars.desiredSeparation/2);

	for(let n = 0; n < fishiesInstances.length; n ++) { 
		const instance = fishiesInstances[n];
		instance.animating = (instance.top < windowHeight+50 && instance.top+instance.height > -50);
		if(instance.animating) {

			const globalSpriteScale = instance.width < 640 ? 0.5 : 1;

			// calculate zones
			if(zoneCalcThrottleCount >= vars.zoneCalcThrottle) {
				zoneCalcThrottleCount = 0;

				// maintain correct amount of fish
				const fishDensity = Math.ceil(10 + (instance.width*instance.height)/(1000*vars.numFishies));
				const excess = instance.fishies.length - fishDensity; 
				if(excess > 0) {
					for(let i=0; i<excess; i++) {
						const fishSprite = instance.fishies[instance.fishies.length-1-excess+i];
						instance.fishiesContainer.removeChild(fishSprite);
						instance.fishies.splice(instance.fishies.indexOf(fishSprite), 1);
					}
				}else if(excess < 0) {
					for(let i=0; i<Math.abs(excess); i++) {
						const fishSprite = initFish(instance.fishies.length+i, instance);
						instance.fishiesContainer.addChild(fishSprite);
						instance.fishies.push(fishSprite);
					}
				}
				
				// reset debug labels etc.
				(instance.zonesContainer.labels || []).map(label => instance.zonesContainer.removeChild(label));
				instance.zonesContainer.labels = [];
				instance.zonesGraphic.clear();
				instance.zonesGraphic.lineStyle(2, 0xFFFFFF, 0.5);

				for(let row = 0; row < instance.height/vars.zoneSize; row ++) {
					const zoneY = row*vars.zoneSize;
					instance.zones[row] = [];

					// draw row quadrant
					if(vars.showZones) {
						instance.zonesGraphic.moveTo(0, zoneY);
						instance.zonesGraphic.lineTo(width, zoneY);
					}

					for(let col = 0; col < instance.width/vars.zoneSize; col ++) {
						const zoneX = col*vars.zoneSize;

						// draw column quadrant
						if(vars.showZones) {
							instance.zonesGraphic.moveTo(zoneX, 0);
							instance.zonesGraphic.lineTo(zoneX, height);
						}

						// update quadrant info
						const children = [...instance.fishies, ...instance.sharks].filter(fish => 
							fish.position.x > zoneX && 
							fish.position.x < zoneX+vars.zoneSize && 
							fish.position.y > zoneY && 
							fish.position.y < zoneY+vars.zoneSize
						);
						const count = children.length;
						const center = children.reduce((point, current) => point.add({x: current.position.x/count, y: current.position.y/count}), new Point());
						instance.zones[row][col] = {row, col, children, center, count};

						for(let z = 0; z < children.length; z++) {
							children[z].zone = [row, col];
						}

						// display labels
						if(vars.showZones) {
							const label = new Text(children.length+' fishies', {font: '12px sans-serif', fill: 0xFFFFFF});
							label.position = new Point(zoneX+10, zoneY+10);
							instance.zonesContainer.addChild(label);
							instance.zonesContainer.labels.push(label);

							const pt = new Graphics();
							pt.beginFill(0xFFFFFF);
							pt.drawCircle(0, 0, 10);
							pt.position = center;
							instance.zonesContainer.addChild(pt);
							instance.zonesContainer.labels.push(pt);
						}
					}
				}
			}

			for(let b=0; b<instance.bubbles.length; b++) { 
				const bubble = instance.bubbles[b];
				bubble.position.y -= (instance.height - bubble.position.y)/70;
				bubble.position.y += scrollOffset;
				if(bubble.position.y < -vars.offscreen) {
					instance.bubblesContainer.removeChild(bubble);
					instance.bubbles.splice(instance.bubbles.indexOf(bubble), 1);
				}
			}

			if(vars.showShark) {
				if(instance.stage.children.indexOf(instance.shark) < 0) instance.stage.addChild(instance.shark);
				for(let s=0; s<instance.sharks.length; s++) {
					const shark = instance.sharks[s];

					if(shark.position.x < -vars.sharkOffscreen) {
						shark.position.x = instance.width + vars.sharkOffscreen - 20;
						shark.rotation = shark.aimRotation = Math.PI + Math.random()*0.6 - 0.3;
					}
					if(shark.position.x > instance.width+vars.sharkOffscreen) {
						shark.position.x = -vars.sharkOffscreen + 20;
						shark.rotation = shark.aimRotation = Math.random()*0.6 - 0.3;
					}
					if(shark.position.y < -vars.sharkOffscreen) shark.position.y = instance.height + vars.sharkOffscreen - (-vars.sharkOffscreen - shark.position.y);
					if(shark.position.y > instance.height+vars.sharkOffscreen) shark.position.y = -vars.sharkOffscreen - (instance.height+vars.sharkOffscreen - shark.position.y);

					// shark.position.y += scrollOffset;
					
					// const surroundingFishies = getSurroundingFishies(shark.zone);
					const cohesionForce = cohesion(shark, instance.fishies, true);
					const forwardMovementForce = new Point(Math.cos(shark.rotation), Math.sin(shark.rotation));
					cohesionForce.multiply(vars.sharkHungerMultiple);
					forwardMovementForce.multiply(vars.sharkForwardMovementMultiple);
					shark.acceleration.add(cohesionForce, forwardMovementForce);
					shark.velocity.add(shark.acceleration);
					shark.velocity.limit(vars.sharkMaxSpeed);
					shark.velocity.multiply(globalSpriteScale);

					// reposition shark
					shark.position.x += shark.velocity.x * vars.globalSpeedMultiple;
					shark.position.y += shark.velocity.y * vars.globalSpeedMultiple;

					// reset acceleration each frame
					shark.acceleration.multiply(0);

					// ease to correct rotation
					const lastAimRotation = shark.aimRotation;
					shark.aimRotation = Math.atan2(shark.velocity.y, shark.velocity.x);

					const modAimRotation = (shark.aimRotation%PI2);
					const modLastAimRotation = (lastAimRotation%PI2);
					if(Math.abs(modLastAimRotation - modAimRotation) > Math.PI) {
						if(modAimRotation < modLastAimRotation) shark.rotationCount ++;
						else shark.rotationCount --;
						shark.rotationCount %= 2; // stop turtle from "flipping out"... get it??
					}

					let diff = (shark.aimRotation + shark.rotationCount*PI2) - shark.rotation;
					if(diff > PI) diff -= PI2;
					if(diff < -PI) diff += PI2;
					shark.rotation += diff/vars.rotationEase;


					shark.scale.x = -vars.sharkScale * globalSpriteScale;

					// instance.flipperSprite1.rotation = Math.sin(sharkTail)*0.2 + 0.1;
					instance.flipperSprite2.rotation = Math.sin(sharkTail + 0.2)*0.1;

					// wag tail
					for(let i=0; i<vars.bendPoints/2; i++) {
						instance.sharkSprite.bendPoints[Math.floor(vars.bendPoints/2 + i)].y = vars.sharpSpineOffsetY + i*2 + Math.cos(sharkTail)*Math.pow(vars.sharkTailMovement*i, 1.4);
					}
					for(let i=0; i<vars.bendPoints; i ++) {
						instance.flipperSprite1.bendPoints[i].y = i*2 + Math.cos(sharkTail)*Math.pow(vars.sharkTailMovement*i, 1.8);
					}

					const absRotation = (shark.rotation%PI2);
					shark.scale.y = ((absRotation > PI/2 && absRotation < PI*1.5) ? -vars.sharkScale : vars.sharkScale) * globalSpriteScale;

					// maybe blow a bubble
					if(Math.random() < vars.sharkBubbleProbability) {
						const bubble = new Sprite(bubbleTexture);
						bubble.scale.set(vars.bubbleSize * globalSpriteScale);
						bubble.position = {x: shark.position.x, y: shark.position.y};
						instance.bubblesContainer.addChild(bubble);
						instance.bubbles.push(bubble);
					}

				}
			}else{
				if(instance.stage.children.indexOf(instance.shark) > -1) instance.stage.removeChild(instance.shark);
			}

			if(vars.showZones) instance.velocitiesGraphic.clear();
			focusOscillation += -vars.focusOscillationSpeed;

			// iterate over the fishies!
			for(let f = 0; f < instance.fishies.length; f ++) {
				const fish = instance.fishies[f];

				// keep in bounds
				if(fish.position.x < -vars.offscreen) {
					fish.position.x = instance.width + vars.offscreen;
					fish.position.y = Math.round(Math.random()*instance.height);
				}
				if(fish.position.x > instance.width+vars.offscreen) {
					fish.position.x = -vars.offscreen;
					fish.position.y = Math.round(Math.random()*instance.height);
				}
				if(fish.position.y < -vars.offscreen) {
					fish.position.y = instance.height + vars.offscreen - (-vars.offscreen - fish.position.y);
					// fish.position.x = Math.round(Math.random()*instance.width); // randomize x position
				}
				if(fish.position.y > instance.height+vars.offscreen) {
					fish.position.y = -vars.offscreen - (instance.height+vars.offscreen - fish.position.y);
					// fish.position.x = Math.round(Math.random()*instance.width); // randomize x position
				}

				// fish.position.y += scrollOffset/parallax;
				 
				// calculate flocking forces
				const surroundingFishies = getSurroundingFishies(fish.zone, instance.zones);
				const seperationForce = seperation(fish, surroundingFishies);
				const sharkFearForce = seperation(fish, instance.sharks, true);
				const cohesionForce = cohesion(fish, surroundingFishies);
				const alignmentForce = alignment(fish, surroundingFishies);
				const currentFocusForce = focusCohesion(fish, instance);
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
				fish.acceleration.multiply(globalSpriteScale);
				fish.velocity.add(fish.acceleration);
				fish.velocity.limit(vars.maxSpeed);

				// reposition fish
				fish.position.x += fish.velocity.x * vars.globalSpeedMultiple;
				fish.position.y += fish.velocity.y * vars.globalSpeedMultiple;

				// reset acceleration each frame
				fish.acceleration.multiply(0);

				// ease to correct rotation
				const lastAimRotation = fish.aimRotation;
				fish.aimRotation = Math.atan2(fish.velocity.y, fish.velocity.x);

				const modAimRotation = (fish.aimRotation%PI2);
				const modLastAimRotation = (lastAimRotation%PI2);
				if(Math.abs(modLastAimRotation - modAimRotation) > Math.PI) {
					if(modAimRotation < modLastAimRotation) fish.rotationCount ++;
					else fish.rotationCount --;
				}

				let diff = (fish.aimRotation + fish.rotationCount*PI2) - fish.rotation;
				if(diff > PI) diff -= PI2;
				if(diff < -PI) diff += PI2;
				fish.rotation += diff/vars.rotationEase;

				// keep upright
				const absRotation = Math.abs(fish.rotation%PI2);
				fish.scale.y = ((absRotation > PI/2 && absRotation < PI*1.5) ? -vars.fishScale : vars.fishScale) * globalSpriteScale;
				fish.scale.x = -vars.fishScale * globalSpriteScale;

				// wag tail
				for(let i=0; i<vars.bendPoints/2; i++) {
					fish.bendPoints[Math.floor(vars.bendPoints/2 + i)].y = Math.cos(fishTail+(fish.key/5))*Math.pow(vars.fishTailMovement*i, 2);
				}

				// maybe blow a bubble
				if(Math.random() < vars.bubbleProbability) {
					const bubble = new Sprite(bubbleTexture);
					bubble.scale.set(vars.bubbleSize * globalSpriteScale);
					bubble.position = {x: fish.position.x, y: fish.position.y};
					instance.bubblesContainer.addChild(bubble);
					instance.bubbles.push(bubble);
				}

				if(vars.showZones) {
					const seperationAngle = Math.atan2(seperationForce.y, seperationForce.x);
					const cohesionAngle = Math.atan2(cohesionForce.y, cohesionForce.x);
					const alignmentAngle = Math.atan2(alignmentForce.y, alignmentForce.x);
					if(seperationForce.x !== 0 && seperationForce.y !== 0) {
						instance.velocitiesGraphic.lineStyle(3, 0xFF0000, 0.5);
						instance.velocitiesGraphic.moveTo(fish.position.x, fish.position.y);
						instance.velocitiesGraphic.lineTo(fish.position.x + Math.cos(seperationAngle)*30, fish.position.y + Math.sin(seperationAngle)*30);
					}
					instance.velocitiesGraphic.lineStyle(3, 0xe4c524, 1);
					instance.velocitiesGraphic.moveTo(fish.position.x, fish.position.y);
					instance.velocitiesGraphic.lineTo(fish.position.x + Math.cos(alignmentAngle)*30, fish.position.y + Math.sin(alignmentAngle)*30);
					instance.velocitiesGraphic.lineStyle(3, 0x00FF00, 0.5);
					instance.velocitiesGraphic.moveTo(fish.position.x, fish.position.y);
					instance.velocitiesGraphic.lineTo(fish.position.x + Math.cos(cohesionAngle)*30, fish.position.y + Math.sin(cohesionAngle)*30);
				}

			}


			if(vars.waterEffect) {
				// instance.displacementSprite.position.x = Math.cos(waterAmount)*vars.waterIntensity;
				// instance.displacementSprite.position.y = Math.sin(waterAmount)*vars.waterIntensity;
				// instance.displacementSprite.anchor.x += vars.waterSpeed;
				// instance.displacementSprite.anchor.y += vars.waterSpeed;
				// instance.stage.filters = [instance.displacementFilter];
			}

			instance.renderer.render(instance.masterStage);
		}
	}

	scrollOffset = 0;	
	window.requestAnimationFrame(animate);
}

function focusCohesion(fish, instance) {
	const sum = new Point();
	if(!$currentFocus) return sum;

	const position = new Point(fish.position.x, fish.position.y);
	const focusPosition = new Point(
		(currentFocusBounds.left - instance.left) + currentFocusBounds.width/2 + Math.cos(focusOscillation)*currentFocusBounds.width*2, 
		(currentFocusBounds.top - instance.top) + currentFocusBounds.height*2 + Math.sin(focusOscillation)*currentFocusBounds.height*8
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
	const seperationAmount = isShark ? vars.sharkFearRadius : desiredSeparation;
	const steer = new Point();
	for(let f = 0; f < surroundingFishies.length; f++) {
		const friend = surroundingFishies[f];
		const position = new Point(fish.position.x, fish.position.y);
		const dist = position.distance(friend.position);
		let count = 0;
		if(dist > 0 && dist < seperationAmount) {
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
	for(let f = 0; f < surroundingFishies.length; f++) {
		const friend = surroundingFishies[f];
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
	for(let f = 0; f < surroundingFishies.length; f++) {
		const friend = surroundingFishies[f];
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
function getSurroundingFishies(zone, zones) {
	if(!zone || !zones) return [];
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


// init();
if(vars.waterEffect) {
	displacementImage.src = '/assets/fishies/displacement.png';//displacementImageUrl;
}else{
	init();
}

