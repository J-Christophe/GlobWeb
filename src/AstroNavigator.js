/***************************************
 * Copyright 2011, 2012 GlobWeb contributors.
 *
 * This file is part of GlobWeb.
 *
 * GlobWeb is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, version 3 of the License, or
 * (at your option) any later version.
 *
 * GlobWeb is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GlobWeb. If not, see <http://www.gnu.org/licenses/>.
 ***************************************/

/**************************************************************************************************************/

/** @export
	@constructor
	Navigation constructor
 */
GlobWeb.AstroNavigator = function(globe)
{
	this.globe = globe;
    this.pressX = -1;
    this.pressY = -1;
	this.lastMouseX = -1;
	this.lastMouseY = -1;
    this.pressedButton = -1;
	this.inverseViewMatrix = mat4.create();
	
	this.minDistance = 0.0005;
	this.maxDistance = 1.;

	// Initialize the navigator
	this.geoCenter = [0.0, 0.0, 0.0];
	this.center3d = [1.0, 0.0, 0.0];
	this.distance = 1;
	this.heading = 0.0;
	this.tilt = 90.0;
	
	this.up = [0., 0., 1.]
	
	this.callbacks = {};

	// Update the view matrix now
	this.computeViewMatrix();
}

/**************************************************************************************************************/

/** 
 Setup the default event handlers for the navigator
 */
GlobWeb.AstroNavigator.prototype.setupDefaultEventHandlers = function(zoomOnDblClick)
{
	// Setup the mouse event handlers
	var self = this;
	var canvas = this.globe.renderContext.canvas;
	canvas.addEventListener("mousedown",function(e) { self.handleMouseDown(e||window.event); },false);
	document.addEventListener("mouseup",function(e) { self.handleMouseUp(e||window.event); },false);
	canvas.addEventListener("mousemove",function(e) { self.handleMouseMove(e||window.event); },false);
	
	if ( zoomOnDblClick )
		canvas.addEventListener("dblclick",function(e) { self.handleMouseDblClick(e||window.event); },false);
		
	// For Firefox
	canvas.addEventListener("DOMMouseScroll",function(e) { self.handleMouseWheel(e||window.event); },false);
	canvas.addEventListener("mousewheel",function(e) { self.handleMouseWheel(e||window.event); },false);
}

/**************************************************************************************************************/

/** @export
  Subscribe to a navigation event : start (called when navigation is started), and end (called when navigation end)
*/
GlobWeb.AstroNavigator.prototype.subscribe = function(name,callback)
{
	if( !this.callbacks[name] ) {
		this.callbacks[name] = [ callback ];
	} else {
		this.callbacks[name].push( callback );
	}
}

/**************************************************************************************************************/

/** @export
  Unsubscribe to a navigation event : start (called when navigation is started), and end (called when navigation end)
*/
GlobWeb.AstroNavigator.prototype.unsubscribe = function(name,callback)
{
	if( this.callbacks[name] ) {
		var i = this.callbacks[name].indexOf( callback );
		if ( i != -1 ) {
			this.callbacks[name].splice(i,1);
		}
	}
}

/**************************************************************************************************************/

/** 
  Publish a navigation event
*/
GlobWeb.AstroNavigator.prototype.publish = function(name)
{
	if ( this.callbacks[name] ) {
		var cbs = this.callbacks[name];
		for ( var i = 0; i < cbs.length; i++ ) {
			cbs[i]();
		}
	}
}

/**************************************************************************************************************/

/** @export
  Zoom to a 3d position
*/
GlobWeb.AstroNavigator.prototype.zoomTo = function(geoPos, distance, duration, tilt )
{
    var navigator = this;
	
	var destTilt = tilt || 90;

    // Create a single animation to animate geoCenter, distance and tilt
	var geoStart = [];
	GlobWeb.CoordinateSystem.from3DToGeo(this.center3d, geoStart);
    var startValue = [geoStart[0], geoStart[1], this.distance, this.tilt];
    var endValue = [geoPos[0], geoPos[1], 0.1, destTilt];
    var animation = new GlobWeb.SegmentedAnimation(
        duration,
        // Value setter
        function(value) {
			var position3d = GlobWeb.CoordinateSystem.fromGeoTo3D(value);
            navigator.center3d[0] = position3d[0];
            navigator.center3d[1] = position3d[1];
			navigator.center3d[2] = position3d[2];
            navigator.distance = value[2];
            navigator.tilt = value[3];
            navigator.computeViewMatrix();
        });

    // Compute a max altitude for the animation
    var worldStart = this.center3d; //GlobWeb.CoordinateSystem.fromGeoTo3D(this.geoCenter);
    var worldEnd   = GlobWeb.CoordinateSystem.fromGeoTo3D(geoPos);
    var vec = vec3.subtract(worldStart, worldEnd);
	var len = vec3.length(vec);
    var canvas = this.globe.renderContext.canvas;
    var minFov = Math.min(Numeric.toRadian(45.0),
                          Numeric.toRadian(45.0 * canvas.width / canvas.height));
    var maxAltitude = 0.5 * ((len / 2.0) / Math.tan(minFov / 2.0));
    if (maxAltitude > this.distance)
    {
        // Compute the middle value
        var midValue = [startValue[0]*0.5 + endValue[0]*0.5,
                        startValue[1]*0.5 + endValue[1]*0.5,
                        maxAltitude, destTilt];

        // Add two segments
        animation.addSegment(
            0.0, startValue,
            0.5, midValue,
            function(t, a, b) {
                var pt = Numeric.easeInQuad(t);
                var dt = Numeric.easeOutQuad(t);
                return [Numeric.lerp(pt, a[0], b[0]), // geoPos.long
                        Numeric.lerp(pt, a[1], b[1]), // geoPos.lat
                        Numeric.lerp(dt, a[2], b[2]), // distance
                        Numeric.lerp(t, a[3], b[3])]; // tilt
            });

        animation.addSegment(
            0.5, midValue,
            1.0, endValue,
            function(t, a, b) {
                var pt = Numeric.easeOutQuad(t);
                var dt = Numeric.easeInQuad(t);
                return [Numeric.lerp(pt, a[0], b[0]), // geoPos.long
                        Numeric.lerp(pt, a[1], b[1]), // geoPos.lat
                        Numeric.lerp(dt, a[2], b[2]), // distance
                        Numeric.lerp(t, a[3], b[3])]; // tilt
            });
    }
    else
    {
        // Add only one segments
        animation.addSegment(
            0.0, startValue,
            1.0, endValue,
            function(t, a, b) {
                var pt = Numeric.easeOutQuad(t);
                var dt = Numeric.easeInQuad(t);
                return [Numeric.lerp(pt, a[0], b[0]),  // geoPos.long
                        Numeric.lerp(pt, a[1], b[1]),  // geoPos.lat
                        Numeric.lerp(dt, a[2], b[2]),  // distance
                        Numeric.lerp(t, a[3], b[3])]; // tilt
            });
    }

	animation.onstop = function() {
		navigator.publish("end");
	}
	this.globe.addAnimation(animation);
    animation.start();
	
	this.publish("start");
}

/**************************************************************************************************************/

/*
	Compute the inverse view matrix
 */
GlobWeb.AstroNavigator.prototype.applyLocalRotation = function(matrix)
{
	// mat4.rotate( matrix, /*(this.heading)*/ 180 * Math.PI / 180.0, [ 0.0, 0.0, 1.0 ] ); // azimuth
	mat4.rotate( matrix, /*(90 - this.tilt)*/ 180 * Math.PI / 180.0 , [ 1.0, 0.0, 0.0 ] ); // zenith
}

/**************************************************************************************************************/

/*
	Compute the view matrix
 */
GlobWeb.AstroNavigator.prototype.computeViewMatrix = function()
{

	var eye = [];
	vec3.normalize(this.center3d);
	var lookAt = [];
	vec3.subtract(this.center3d, [0., 0., 0.], lookAt);
	vec3.scale(lookAt, (1. - this.distance), eye);
	
	var vm = this.globe.renderContext.viewMatrix;
	
	mat4.lookAt(eye, this.center3d, this.up, vm);
	this.up = [ vm[1], vm[5], vm[9] ];

}

/**************************************************************************************************************/

/*
	Event handler for mouse wheel
 */
GlobWeb.AstroNavigator.prototype.handleMouseWheel = function(event)
{
	this.publish("start");
	
	var previousDistance = this.distance;
	
	// Check differences between firefox and the rest of the world 
	if ( event.wheelDelta === undefined)
	{
		this.distance *= (1 + event.detail * 0.1);
	}
	else
	{
		this.distance *= (1 + (-event.wheelDelta / 120.0) * 0.1);
	}
	
	if ( this.distance > this.maxDistance )
	{
		this.distance = this.maxDistance;
	}
	if ( this.distance < this.minDistance )
	{
		this.distance = this.minDistance;
	}

	this.computeViewMatrix();
	
	// Stop mouse wheel to be propagated, because default is to scroll the page
	// This is need when using Firefox event listener on DOMMouseScroll
	if ( event.preventDefault )
	{
		event.preventDefault();
	}
	event.returnValue = false;
	
	this.publish("end");
	this.globe.renderContext.requestFrame();
		
	// Return false to stop mouse wheel to be propagated when using onmousewheel
	return false;
}

/**************************************************************************************************************/

/*
	Event handler for mouse down
 */
GlobWeb.AstroNavigator.prototype.handleMouseDown = function(event)
{
	//console.log("button " + event.button);
	//console.log("modifiers " + event.altKey);

    this.pressedButton = event.button;
	
	if ( event.button == 0 || event.button == 1 )
	{
        this.pressX = event.clientX;
        this.pressY = event.clientY;
		
		this.lastMouseX = event.clientX;
		this.lastMouseY = event.clientY;
		
		this.publish("start");
		
        // Return false to stop mouse down to be propagated when using onmousedown
		return false;
	}

	return true;
}

/**************************************************************************************************************/

/*
	Pan the navigator
 */
GlobWeb.AstroNavigator.prototype.pan = function(dx,dy)
{
	var previousGeoCenter = vec3.create();
	vec3.set( this.geoCenter, previousGeoCenter );
	
	// Get geographic frame
	var local2World = mat4.create();
	GlobWeb.CoordinateSystem.getLocalTransform(this.geoCenter, local2World);
	// Then corresponding vertical axis and north
	var z = vec3.create(); var previousNorth = vec3.create([0.0, 1.0, 0.0]);
	GlobWeb.CoordinateSystem.getUpVector( local2World, z );
	//GlobWeb.CoordinateSystem.getFrontVector( local2World, previousNorth );
	mat4.multiplyVec3(local2World, previousNorth, previousNorth);
	
	// Then apply local transform
	this.applyLocalRotation(local2World);
	// Retrieve corresponding axes
	var x = vec3.create(); var y = vec3.create();
	GlobWeb.CoordinateSystem.getSideVector( local2World, x );
	GlobWeb.CoordinateSystem.getFrontVector( local2World, y );
	// According to our local configuration, up is y and side is x
	
	// Compute direction axes
	vec3.cross(z, x, y);
	vec3.cross(y, z, x);
	vec3.normalize(x, x);
	vec3.normalize(y, y);
	
	//Normalize dx and dy
	dx = dx / this.globe.renderContext.canvas.width;
	dy = dy / this.globe.renderContext.canvas.height;
	
	// Move accordingly
	var position = vec3.create();
	GlobWeb.CoordinateSystem.fromGeoTo3D(this.geoCenter, position);
	vec3.scale(x, dx * this.distance, x);
	vec3.scale(y, dy * this.distance, y);
	vec3.add(position, x, position);
	vec3.add(position, y, position);
	
	// Clamp onto sphere
	vec3.normalize(position);
	// vec3.scale(position, GlobWeb.CoordinateSystem.radius);
	
	// Update geographic center
	GlobWeb.CoordinateSystem.from3DToGeo(position, this.geoCenter);

	// Compute new north axis
	var newNorth = vec3.create([0.0, 1.0, 0.0]);
	GlobWeb.CoordinateSystem.getLocalTransform(this.geoCenter, local2World);
	mat4.multiplyVec3(local2World, newNorth, newNorth);
	
	// Take care if we traverse the pole, ie the north is inverted
	if ( vec3.dot(previousNorth, newNorth) < 0 )
	{
		this.heading = (this.heading + 180.0) % 360.0;
	}
		
	// Check for collision with terrain
	this.computeViewMatrix();
	
	// if ( this.hasCollision() )
	// {
		// this.geoCenter = previousGeoCenter;
		// this.computeViewMatrix();
	// }
}

/**
*	Pan the navigator by computing the difference between geocenters
*	xs,ys : window coordinates of the point of start
*	xd,yd : window coordinates of the point of destination
*/
GlobWeb.AstroNavigator.prototype.geoPan = function(xs, ys, xd, yd)
{
	var geoSrc = [];
	var geoDest = [];
	var previousGeoCenter = this.geoCenter;
	
	// Geo coordinates of source&destination
	var source3d = this.globe.renderContext.get3DFromPixel(xs, ys);
	var dest3d = this.globe.renderContext.get3DFromPixel(xd, yd);
	
	// convert to 3d
	//var source3d = GlobWeb.CoordinateSystem.fromGeoTo3D(geoSrc);
	//var dest3d = GlobWeb.CoordinateSystem.fromGeoTo3D(geoDest);
	
	// compute direction vector
	var dir = [];
	vec3.subtract(dest3d, source3d, dir);
	
	// get 3d position of geoCenter
	var position = vec3.create();
	// GlobWeb.CoordinateSystem.fromGeoTo3D(this.geoCenter, position);
	
	// translate geoCenter by direction
	vec3.subtract(this.center3d, dir, this.center3d);

	this.computeViewMatrix();
	
	// update geoCenter
	// GlobWeb.CoordinateSystem.from3DToGeo(position, this.geoCenter);
}

/**************************************************************************************************************/

/*
	Rotate the navigator
 */
GlobWeb.AstroNavigator.prototype.rotate = function(dx,dy)
{
	var previousHeading = this.heading;
	var previousTilt = this.tilt;
	
	this.heading += dx * 0.1;
	this.tilt += dy * 0.1;
	
	this.computeViewMatrix();
}

/**************************************************************************************************************/

/*
	Event handler for mouse move
 */
GlobWeb.AstroNavigator.prototype.handleMouseMove = function(event)
{
    // No button pressed
    if (this.pressedButton < 0)
        return;

	var dx = (event.clientX - this.lastMouseX);
	var dy = (event.clientY - this.lastMouseY);
	
	// Pan
    if ( this.pressedButton == 0 )
    {
		// this.pan( dx, dy );
		this.geoPan( this.lastMouseX, this.lastMouseY, event.clientX, event.clientY );
		
		this.lastMouseX = event.clientX;
		this.lastMouseY = event.clientY;
		this.globe.renderContext.requestFrame();
		
		return true;
	}
	// Rotate
    else if ( this.pressedButton == 1 )
    {
		this.rotate(dx,dy);
		this.globe.renderContext.requestFrame();
		return true;
    }
	
	return false;
}

/**************************************************************************************************************/

/*
	Event handler for mouse up
 */
GlobWeb.AstroNavigator.prototype.handleMouseUp = function(event)
{
    // No button pressed anymore
	this.pressedButton = -1;

	if ( event.button == 0 || event.button == 1 )
	{
		this.publish("end");
		
       // Stop mouse up event
        return false;
	}

    return true;
}

/**************************************************************************************************************/

/*
	Event handler for mouse double click
 */
GlobWeb.AstroNavigator.prototype.handleMouseDblClick = function(event)
{
    if (event.button == 0)
    {
		var pos = this.globe.renderContext.getXYRelativeToCanvas(event);
        var geo = this.globe.getLonLatFromPixel( pos[0], pos[1] );
		
		if (geo)
        {
            this.zoomTo(geo, this.distance, 5000, this.tilt);
        }
    }
}

/**************************************************************************************************************/

