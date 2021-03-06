"use strict";

(function () {
	var clamp = utils.clamp;
	var touchToMouse = utils.touchToMouse;

	var Camera = gameOfLife3d.Camera;
	var World = gameOfLife3d.World;
	var Renderer = gameOfLife3d.Renderer;

	var vertexShaderRequest = new XMLHttpRequest();
	var fragmentShaderRequest = new XMLHttpRequest();

	vertexShaderRequest.onreadystatechange = onReadyStateChange;
	vertexShaderRequest.open("GET", "/js/game-of-life-3d/shader.vert");
	vertexShaderRequest.responseType = "text";
	vertexShaderRequest.send();

	fragmentShaderRequest.onreadystatechange = onReadyStateChange;
	fragmentShaderRequest.open("GET", "/js/game-of-life-3d/shader.frag");
	fragmentShaderRequest.responseType = "text";
	fragmentShaderRequest.send();

	var canvas = document.getElementById("game-of-life-3d-canvas");
	var gl = canvas.getContext("webgl");
	canvas.focus();

	var form = document.forms["game-of-life-3d"];
	var rulesetElement = form.elements.ruleset;
	var wrapElement = form.elements.wrap;

	var camera = new Camera({ z: 64 });
	var mouseX = NaN;
	var mouseY = NaN;
	var mouseDown = false;
	var left = false;
	var right = false;
	var up = false;
	var down = false;
	var paused = false;

	// Updates to the game are computationally expensive. Since older browsers do not support asynchronous functions,
	// the workload is split up in smaller chunks which are executed synchronously at each frame.
	//
	// There are two types of updates: cell updates and buffers updates. Cell updates incrementally update the state of
	// the world according to the rules of Game of Life; buffers updates incrementally update the buffers uploaded to
	// the graphics card. The "update" variable keeps track of which kind of update we are currently working on.
	//
	// Internally, double buffering is used for updates; the buffers are swapped only if the entire workload has been
	// completed.
	var update = "cells";

	var world = new World(64, 64, 64, true, [4, 5], [5]);
	world.forEach(function () { return Math.random() < 0.1; });
	world.onUpdateComplete = function () { update = "buffers"; };

	var renderer = new Renderer(gl, world);
	renderer.updateBuffers(world.volume);
	renderer.onUpdateComplete = function () { update = "cells"; };

	form.addEventListener("submit", function (event) {
		event.preventDefault();
	});

	rulesetElement.addEventListener("change", function () {
		var ruleset = rulesetElement.value.match(rulesetElement.pattern);
		if (ruleset == null) return;

		world.environment = (ruleset[1] || "").split(/\s*,\s*/).map(function (s) { return parseInt(s, 10); });
		world.fertility = (ruleset[2] || "").split(/\s*,\s*/).map(function (s) { return parseInt(s, 10); });
	});

	wrapElement.addEventListener("change", function () {
		world.wrap = wrapElement.checked;
	});

	canvas.addEventListener("contextmenu", function (event) {
		event.preventDefault();
	});

	canvas.addEventListener("mousedown", function (event) {
		var boundingClientRect = canvas.getBoundingClientRect();
		mouseX = event.clientX - boundingClientRect.x;
		mouseY = event.clientY - boundingClientRect.y;
		mouseDown = true;
	});

	document.addEventListener("mousemove", function (event) {
		var boundingClientRect = canvas.getBoundingClientRect();
		var newMouseX = event.clientX - boundingClientRect.x;
		var newMouseY = event.clientY - boundingClientRect.y;

		if (mouseDown) {
			var rx = camera.rx + (newMouseY - mouseY) / canvas.clientHeight * Math.PI;
			camera.rx = clamp(rx, -(Math.PI / 2), Math.PI / 2);
			camera.ry += (newMouseX - mouseX) / canvas.clientWidth * Math.PI;
		}

		mouseX = newMouseX;
		mouseY = newMouseY;
	});

	document.addEventListener("mouseup", function () {
		mouseDown = false;
	});

	canvas.addEventListener("touchstart", function (event) {
		canvas.dispatchEvent(touchToMouse(event, "mousedown"));
		event.preventDefault();
	});

	document.addEventListener("touchmove", function (event) {
		document.dispatchEvent(touchToMouse(event, "mousemove"));
	});

	document.addEventListener("touchend", function (event) {
		document.dispatchEvent(touchToMouse(event, "mouseup"));
	});

	canvas.addEventListener("keydown", function (event) {
		switch (event.key) {
			case "f":
			case "F":
				if (!document.fullscreenElement)
					canvas.requestFullscreen();
				else
					document.exitFullscreen();
				break;
		}

		switch (event.code || event.keyCode) {
			case "KeyA":
			case 0x41:
				left = true;
				event.preventDefault();
				break;

			case "KeyD":
			case 0x44:
				right = true;
				event.preventDefault();
				break;

			case "KeyW":
			case 0x57:
				up = true;
				event.preventDefault();
				break;

			case "KeyS":
			case 0x53:
				down = true;
				event.preventDefault();
				break;

			case "Space":
			case 0x20:
				paused = !paused;
				event.preventDefault();
				break;
		}
	});

	document.addEventListener("keyup", function (event) {
		switch (event.code || event.keyCode) {
			case "KeyA":
			case 0x41:
				left = false;
				break;

			case "KeyD":
			case 0x44:
				right = false;
				break;

			case "KeyW":
			case 0x57:
				up = false;
				break;

			case "KeyS":
			case 0x53:
				down = false;
				break;
		}
	});

	function onReadyStateChange() {
		if (vertexShaderRequest.readyState !== XMLHttpRequest.DONE || vertexShaderRequest.status !== 200) return;
		if (fragmentShaderRequest.readyState !== XMLHttpRequest.DONE || fragmentShaderRequest.status !== 200) return;

		var vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, vertexShaderRequest.responseText);
		gl.compileShader(vertexShader);

		if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
			throw new Error("Vertex shader: " + gl.getShaderInfoLog(vertexShader));

		var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, fragmentShaderRequest.responseText);
		gl.compileShader(fragmentShader);

		if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
			throw new Error("Fragment shader: " + gl.getShaderInfoLog(fragmentShader));

		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error("Program: " + gl.getProgramInfoLog(program));

		var aPositionLocation = gl.getAttribLocation(program, "aPosition");
		var aNormalLocation = gl.getAttribLocation(program, "aNormal");
		var uViewMatrixLocation = gl.getUniformLocation(program, "uViewMatrix");
		var uProjectionMatrixLocation = gl.getUniformLocation(program, "uProjectionMatrix");
		var uLightDirectionLocation = gl.getUniformLocation(program, "uLightDirection");

		requestAnimationFrame(function (timeStamp) {
			var now = timeStamp;
			var delta = 0;

			requestAnimationFrame(function callback(timeStamp) {
				delta = (delta + (timeStamp - now) / 1000) / 2;  // Exponential moving average
				now = timeStamp;
				render(delta);
				requestAnimationFrame(callback);
			});
		});

		function render(delta) {
			if (left) camera.ry += delta;
			if (right) camera.ry -= delta;
			if (up) camera.rx = Math.min(camera.rx + delta, Math.PI / 2);
			if (down) camera.rx = Math.max(-(Math.PI / 2), camera.rx - delta);

			if (!paused) {
				switch (update) {
					case "cells":
						world.updateCells(Math.ceil(2 * delta * world.volume));
						break;

					case "buffers":
						renderer.updateBuffers(Math.ceil(2 * delta * world.volume));
						break;
				}
			}

			if (!document.fullscreenElement)
				canvas.style.height = canvas.clientWidth * (9 / 16) + "px";

			canvas.width = canvas.clientWidth;
			canvas.height = canvas.clientHeight;
			camera.aspect = canvas.clientWidth / canvas.clientHeight;

			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

			gl.enable(gl.CULL_FACE);
			gl.enable(gl.DEPTH_TEST);

			gl.clearColor(0, 0, 0, 0);
			gl.clearDepth(1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			gl.useProgram(program);
			gl.uniformMatrix4fv(uViewMatrixLocation, false, camera.viewMatrix);
			gl.uniformMatrix4fv(uProjectionMatrixLocation, false, camera.projectionMatrix);
			gl.uniform3f(uLightDirectionLocation, -1, -2, -3);

			renderer.render(aPositionLocation, aNormalLocation);
		}
	}
})();