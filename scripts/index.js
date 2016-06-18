import $ from 'jquery'
import PIXI, { Container, Sprite, Graphics, Text, BaseTexture, Texture, loader as Loader } from 'pixi.js'
import _throttle from 'lodash.throttle'

const fishFiles = ['fish1.png','fish2.png','fish3.png','fish4.png','fish5.png','fish6.png','fish7.png','fish8.png','fish9.png','fish10.png','fish11.png','fish12.png'];
const numFishies = 100;
const fishScale = 0.3;
const offscreen = 35; //px;

const showZones = true;
const zones = [];
const zoneSize = 200; // px
const zoneCalcThrottle = 10; // every nth frame

let $fishiesContainer = null;
let animating = true;
let canvas = null;
let renderer = null;
let stage = null;

let width = null;
let height = null;
let resolution = null;

const PI = Math.PI;
const PI2 = PI*2;

const fishSprites = [];
const fishies = [];

let zoneCalcThrottleCount = 0;
const zonesContainer = new Container();
const zonesGraphic = new Graphics();
zonesContainer.addChild(zonesGraphic);

export function init() {
	$(document).ready(() => {
		$fishiesContainer = $('#fishies_bg');

		width = $fishiesContainer.width();
		height = $fishiesContainer.height();
		resolution = window.devicePixelRatio || 1;

		renderer = new PIXI.autoDetectRenderer(width, height, {
			resolution, 
			transparent: false,
			backgroundColor: 0x175282,
		});
		canvas = renderer.view;
		$fishiesContainer[0].appendChild(canvas);
		stage = new Container();

		$(window).resize(rendererResize);
		$(window).on('focus', () => rendererResize());
		rendererResize();

		Loader.on('progress', handleLoaderProgress);
		Loader.once('complete', handleLoaderComplete);

		for(let fish of fishFiles) {
			Loader.add(fish.split('.')[0], 'assets/'+fish);
		}

		Loader.load();

	});
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
		const fishSprite = new Sprite(resources[key].texture);
		fishSprite.key = key;
		fishSprites.push(fishSprite);
	});

	initScene();
}

function initScene() {

	stage.addChild(zonesContainer);

	for(let i=0; i < numFishies; i ++) {
		const fishSprite = new Sprite();
		fishSprite.texture = fishSprites[i%fishSprites.length].texture;
		fishSprite.anchor = {x: 0.25, y: 0.5};
		fishSprite.position.x = Math.random()*width;
		fishSprite.position.y = Math.random()*height;
		fishSprite.rotation = Math.random()*Math.PI*2;
		fishSprite.scale = {x: -fishScale, y: fishScale};
		stage.addChild(fishSprite);
		fishies.push(fishSprite);
	}

	animate();

}

function animate() {

	// calculate zones
	if(++zoneCalcThrottleCount >= zoneCalcThrottle) {
		zoneCalcThrottleCount = 0;
		if(showZones) {
			(zonesContainer.labels || []).map(label => zonesContainer.removeChild(label));
			zonesContainer.labels = [];
			zonesGraphic.clear();
			zonesGraphic.lineStyle(1, 0xFFFFFF, 0.5);
		}
		for(let row = 0; row < height/zoneSize; row ++) {
			const zoneY = row*zoneSize;
			zones[row] = [];
			if(showZones) {
				zonesGraphic.moveTo(0, zoneY);
				zonesGraphic.lineTo(width, zoneY);
			}
			for(let col = 0; col < width/zoneSize; col ++) {
				const zoneX = col*zoneSize;
				if(showZones) {
					zonesGraphic.moveTo(zoneX, 0);
					zonesGraphic.lineTo(zoneX, height);
				}
				const children = fishies.filter(fish => 
					fish.position.x > zoneX && 
					fish.position.x < zoneX+zoneSize && 
					fish.position.y > zoneY && 
					fish.position.y < zoneY+zoneSize
				);
				const center = children.reduce((prev, current) => ({x: prev.x+(current.position.x/children.length), y: prev.y+(current.position.y/children.length)}), {x: 0, y: 0});
				zones[row][col] = {children, center, count: children.length};

				const label = new Text(children.length+' fishies', {font: '12px sans-serif', fill: 0xFFFFFF});
				label.position = {x: zoneX+10, y: zoneY+10};
				zonesContainer.addChild(label);
				zonesContainer.labels.push(label);

				const pt = new Graphics();
				pt.beginFill(0xFFFFFF);
				pt.drawCircle(0, 0, 10);
				pt.position = center;
				zonesContainer.addChild(pt);
				zonesContainer.labels.push(pt)
			}
		}
	}

	for(let fish of fishies) {
		fish.rotation += Math.random()*0.2 - 0.1;
		fish.position.x += Math.cos(fish.rotation);
		fish.position.y += Math.sin(fish.rotation);
		const absRotation = (fish.rotation%PI2);
		fish.scale.y = (absRotation > PI/2 && absRotation < PI*1.5) ? -fishScale : fishScale;
		if(fish.position.x < -offscreen*1.5) fish.position.x = width + offscreen;
		if(fish.position.x > width+offscreen*1.5) fish.position.x = -offscreen;
		if(fish.position.y < -offscreen) fish.position.y = height + offscreen;
		if(fish.position.y > height+offscreen*1.5) fish.position.y = -offscreen;
	}

	renderer.render(stage);
	if(animating) window.requestAnimationFrame(animate);
}



init();