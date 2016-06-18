import $ from 'jquery'
import PIXI, { Container, Sprite, Graphics, Text, BaseTexture, Texture, loader as Loader } from 'pixi.js'
import _throttle from 'lodash.throttle'
import _get from 'lodash.get'
import Point from './Point'

const bgColor = 0x175282;
const fishFiles = ['fish1.png','fish2.png','fish3.png','fish4.png','fish5.png','fish6.png','fish7.png','fish8.png','fish9.png','fish10.png','fish11.png','fish12.png'];
const numFishies = 30;
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
let scroll = 0;
let scrollOffset = 0;

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
			backgroundColor: bgColor,
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

		$(document).scroll(updateScroll);
		updateScroll();

	});
}

const updateScroll = _throttle(() => {
	const newScroll = $(document).scrollTop();
	scrollOffset += scroll-newScroll;
	scroll = newScroll;
}, 1000/60);

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
		fishSprite.anchor = new Point(0.25, 0.5);
		fishSprite.position.x = Math.random()*width;
		fishSprite.position.y = Math.random()*height;
		fishSprite.rotation = Math.random()*Math.PI*2;
		fishSprite.scale = new Point(-fishScale, fishScale);
		fishSprite.buttonMode = true;
		fishSprite.interactive = true;
		fishSprite.on('mouseover', () => fishSprite.over = true);
		fishSprite.on('mouseout', () => fishSprite.over = false);
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
				
				// draw quadrant
				if(showZones) {
					zonesGraphic.moveTo(zoneX, 0);
					zonesGraphic.lineTo(zoneX, height);
				}

				// update quadrant info
				const children = fishies.filter(fish => 
					fish.position.x > zoneX && 
					fish.position.x < zoneX+zoneSize && 
					fish.position.y > zoneY && 
					fish.position.y < zoneY+zoneSize
				);
				const count = children.length;
				const center = children.reduce((point, current) => point.add({x: current.position.x/count, y: current.position.y/count}), new Point());
				zones[row][col] = {children, center, count: children.length};

				for(let fish of children) {
					fish.zone = [row, col];
				}

				// display labels
				if(showZones) {
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

			// show neighbouring fish if hovering
			if(showZones) {
				for(let fish of fishies) {
					if(fish.over) {
						console.log(fish.over);
						const surroundingFishies = getSurroundingZoneFishies(fish.zone);
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
	}

	let i=0;
	for(let fish of fishies) {

		// swim towards random rotation
		fish.rotation += Math.random()*0.2 - 0.1;
		fish.position.x += Math.cos(fish.rotation);
		fish.position.y += Math.sin(fish.rotation);
		
		// keep upright
		const absRotation = (fish.rotation%PI2);
		fish.scale.y = (absRotation > PI/2 && absRotation < PI*1.5) ? -fishScale : fishScale;

		// keep in bounds
		if(fish.position.x < -offscreen) fish.position.x = width + offscreen;
		if(fish.position.x > width+offscreen) fish.position.x = -offscreen;
		if(fish.position.y < -offscreen) fish.position.y = height + offscreen - (-offscreen - fish.position.y);
		if(fish.position.y > height+offscreen) fish.position.y = -offscreen - (height+offscreen - fish.position.y);

		fish.position.y += scrollOffset;
		// i++;
		// fish.position.y += scrollOffset/((i%3)/2 + 1);
		// fish.tint = bgColor/((i%3));

	}
	scrollOffset = 0;

	renderer.render(stage);
	if(animating) window.requestAnimationFrame(animate);
}

function getSurroundingZoneFishies(zone) {
	return [
		..._get(zones, '['+(zone[0]+0)+']['+(zone[1]+0)+'].children', []), // MM
		..._get(zones, '['+(zone[0]+0)+']['+(zone[1]-1)+'].children', []), // TM
		..._get(zones, '['+(zone[0]+1)+']['+(zone[1]-1)+'].children', []), // TR
		..._get(zones, '['+(zone[0]+1)+']['+(zone[1]+0)+'].children', []), // MR
		..._get(zones, '['+(zone[0]+1)+']['+(zone[1]+1)+'].children', []), // BR
		..._get(zones, '['+(zone[0]+0)+']['+(zone[1]+1)+'].children', []), // BM
		..._get(zones, '['+(zone[0]-1)+']['+(zone[1]+1)+'].children', []), // BL
		..._get(zones, '['+(zone[0]-1)+']['+(zone[1]+0)+'].children', []), // ML
		..._get(zones, '['+(zone[0]-1)+']['+(zone[1]-1)+'].children', []), // TL
	];
}

function getImmediateFishies(_fish) {
	return getSurroundingZoneFishies(_fish.zone).filter(fish => {

	});

}



init();