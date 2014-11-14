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

define(['./Utils','./FeatureStyle','./VectorRendererManager','./TiledVectorRenderable','./TiledVectorRenderer','./Numeric','./Triangulator','./PolygonCutter'],
	function(Utils,FeatureStyle,VectorRendererManager,TiledVectorRenderable,TiledVectorRenderer,Numeric,Triangulator,PolygonCutter) {

/**************************************************************************************************************/


/** @constructor
 *	PolygonRenderable constructor
 */
var PolygonRenderable = function( bucket )
{
	TiledVectorRenderable.prototype.constructor.call(this,bucket);
	this.glMode = bucket.renderer.tileManager.renderContext.gl.TRIANGLES;
}

/**************************************************************************************************************/

// Inheritance
Utils.inherits(TiledVectorRenderable,PolygonRenderable);

/**************************************************************************************************************/

/**
 * Build children indices.
 * Children indices are used to render a tile children when it is not completely loaded.
 */
PolygonRenderable.prototype.buildChildrenIndices = function( tile )
{
	this.childrenIndices = [ [], [], [], [] ];
	this.childrenIndexBuffers = [ null, null, null, null ];
	
	for ( var n = 0;  n < this.triIndices.length; n+=3 )
	{	
		var vertexOffset1 = 3 * this.triIndices[n];
		var vertexOffset2 = 3 * this.triIndices[n+1];
		var vertexOffset3 = 3 * this.triIndices[n+2];
		
		var x1 = this.vertices[vertexOffset1];
		var x2 = this.vertices[vertexOffset2];
		var x3 = this.vertices[vertexOffset3];
		
		var i = 0;
		if ( x1 > 0 ||  ( x1 == 0 && x2 > 0 ) || (x1 == 0 && x2 == 0 && x3 > 0) )
			i = 1;			
		
		var y1 = this.vertices[vertexOffset1+1];
		var y2 = this.vertices[vertexOffset2+1];
		var y3 = this.vertices[vertexOffset3+1];
		
		var j = 1;
		if ( y1 > 0 ||  ( y1 == 0 && y2 > 0 ) || (y1 == 0 && y2 == 0 && y3 > 0) )
			j = 0;
		
		this.childrenIndices[ 2*j + i ].push( this.triIndices[n], this.triIndices[n+1], this.triIndices[n+2] )
	}
}

function _getArea( ring ) 
{
	var p1, p2;
	var area = 0.0;
	for(var i=0; i<ring.length-1; i++) {
		p1 = ring[i];
		p2 = ring[i+1];
		
		area += (p1[0] + p2[0]) * (p2[1] - p1[1]);
	}
	return - area * 0.5;
}


var PointSet = function(points)
{
	this.points = [];
	this.indexMap = {};
	
	for ( var i = 0; i < points.length; i++ )
	{
		this.addPoint( points[i] );
	}
}

PointSet.prototype.addPoint = function(pt)
{
	var key = pt[0] + "-" + pt[1];
	if ( !this.indexMap[key] )
	{
		this.indexMap[key] = this.points.length;
		this.points.push(pt);
	}
	return this.indexMap[key];
}
			
		
var clipPolygonToTriGrid_O = function( polygons, pointSet, a, b, c, level, res )
{
	if  ( level == 0 )
	{
		for ( var i = 0; i < polygons.length; i++ )
			res.push( polygons[i] );
		return;
	}
	
	var ab = [ (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5 ];
	var bc = [ (c[0] + b[0]) * 0.5, (c[1] + b[1]) * 0.5 ];
	var ca = [ (a[0] + c[0]) * 0.5, (a[1] + c[1]) * 0.5 ];
	
	var cutter = new PolygonCutter( pointSet );
	cutter.cutMulti( polygons, bc, ab );
	
	if ( cutter.insidePolygons.length > 0 )
		clipPolygonToTriGrid_O( cutter.insidePolygons, pointSet, bc, ab, b, level-1, res );
	
	if ( cutter.outsidePolygons.length > 0 )
	{
		cutter.cutMulti( cutter.outsidePolygons, ca, bc );
				
		if ( cutter.insidePolygons.length > 0 )
			clipPolygonToTriGrid_O( cutter.insidePolygons, pointSet, ca, bc, c, level-1, res );
		
		if ( cutter.outsidePolygons.length > 0 )
		{
			cutter.cutMulti( cutter.outsidePolygons, ab, ca );

			if ( cutter.insidePolygons.length > 0 ) clipPolygonToTriGrid_O( cutter.insidePolygons, pointSet, ab, ca, a, level-1, res );
			if ( cutter.outsidePolygons.length > 0 ) clipPolygonToTriGrid_O( cutter.outsidePolygons, pointSet, ca, ab, bc, level-1, res );
		}
	}
}

var clipPolygonToTriGridStartUp = function( pointSet, bounds, level )
{
	// Build an index polygon
	var poly = [];
	for ( var i = 0; i < pointSet.points.length; i++ )
	{
		poly[i] = i;
	}

	var cutter = new PolygonCutter( pointSet );
	cutter.cut( poly, [ bounds[0], bounds[1] ], [ bounds[0], bounds[3] ] );
	cutter.cutMulti( cutter.insidePolygons, [ bounds[0], bounds[3] ], [ bounds[2], bounds[3] ] );
	cutter.cutMulti( cutter.insidePolygons, [ bounds[2], bounds[3] ], [ bounds[2], bounds[1] ] );
	cutter.cutMulti( cutter.insidePolygons, [ bounds[2], bounds[1] ], [ bounds[0], bounds[1] ] );

//	return cutter.insidePolygons;
	
	cutter.cutMulti( cutter.insidePolygons, [ bounds[0], bounds[3] ], [ bounds[2], bounds[1] ] );
	var res = [];
	if ( cutter.insidePolygons.length > 0 ) clipPolygonToTriGrid_O( cutter.insidePolygons, pointSet, [ bounds[0], bounds[1] ], [ bounds[0], bounds[3] ], [ bounds[2], bounds[1] ], level, res );
	if ( cutter.outsidePolygons.length > 0 ) clipPolygonToTriGrid_O( cutter.outsidePolygons, pointSet, [ bounds[0], bounds[3] ], [ bounds[2], bounds[3] ], [ bounds[2], bounds[1] ], level, res );
	return res;
}

/**************************************************************************************************************/

/**
 * Clamp a polygon on a tile
 */
PolygonRenderable.prototype.buildVerticesAndIndices = function( tile, coordinates )
{
	var size = tile.config.tesselation-1;
	var numLevel = Math.floor( Math.log( size ) / Math.log(2) );
	
	// Convert points to tile "coordinates"
	var points = tile.lonlat2tile(coordinates);
	
	// A CW order is needed, so compute signed area to check if the input polygon is CW or not
	// Note : the transfromation lonlat2tile inverse the area compared to input coordinates
	var area = _getArea(points);
	if  ( area > 0 )
	{
		// Revert the points to have a CW polygon as input
		for ( var n = 0; n < points.length / 2; n++ )
		{
			var tmp = points[n];
			points[n] = points[ points.length - n - 1];
			points[ points.length - n - 1] = tmp;
		}		
	}
	
	// Recursively tesselate a polygon
	var pointSet = new PointSet( points );
	var polygons = clipPolygonToTriGridStartUp( pointSet, [ 0.0, 0.0, size, size ], numLevel );
	if ( polygons.length > 0 )
	{
		var indexOffset = this.vertices.length / 3;
		
		// First fill vertex buffer
		for ( var n = 0; n < pointSet.points.length; n++ )
		{	
			var pt = pointSet.points[ n ];
			var vec = tile.computePosition(pt[0],pt[1]);
			this.vertices.push( vec[0], vec[1], vec[2] );
		}
		
		// Then fill index buffer
		for ( var n = 0; n < polygons.length; n++ )
		{
			var polygon = polygons[n];
			if ( polygon.length == 4 ) {
				this.triIndices.push( polygon[0] + indexOffset, polygon[2] + indexOffset, polygon[1] + indexOffset );
				//this.lineIndices.push( polygon[0] + indexOffset, polygon[2] + indexOffset, polygon[2] + indexOffset, polygon[1] + indexOffset, polygon[1] + indexOffset, polygon[0] + indexOffset );
			}
			else if ( polygon.length == 5 ) {
				this.triIndices.push( polygon[0] + indexOffset, polygon[3] + indexOffset, polygon[1] + indexOffset );
				this.triIndices.push( polygon[3] + indexOffset, polygon[2] + indexOffset, polygon[1] + indexOffset );
				//this.lineIndices.push(  polygon[0] + indexOffset, polygon[3] + indexOffset, polygon[3] + indexOffset, polygon[1] + indexOffset, polygon[1] + indexOffset, polygon[0] + indexOffset );
				//this.lineIndices.push(  polygon[3] + indexOffset, polygon[2] + indexOffset, polygon[2] + indexOffset, polygon[1] + indexOffset, polygon[1] + indexOffset, polygon[3] + indexOffset );
			} else {
				// Process one polygon
				var coords = new Array( polygon.length );
				for ( var i = 0; i < polygon.length; i++ )
				{
					coords[i] = pointSet.points[ polygon[i] ];
				}
				var tris = Triangulator.process( coords );
				if ( tris )
				{		
					for ( var i = 0; i < tris.length; i+= 3 )
					{
						this.triIndices.push( polygon[ tris[i] ] + indexOffset, polygon[ tris[i+2] ] + indexOffset, polygon[ tris[i+1] ] + indexOffset );
						//this.lineIndices.push( polygon[ tris[i] ] + indexOffset, polygon[ tris[i+2] ] + indexOffset );
						//this.lineIndices.push( polygon[ tris[i+2] ] + indexOffset, polygon[ tris[i+1] ] + indexOffset );
						//this.lineIndices.push( polygon[ tris[i+1] ] + indexOffset, polygon[ tris[i] ] + indexOffset );
					}
				}
				else
				{
					console.log("Triangulation problem");
				}
			}
		}
	}
}

/**************************************************************************************************************/

/** @constructor
 *  @extends TiledVectorRenderer
 */
var PolygonRenderer = function( globe )
{
	TiledVectorRenderer.prototype.constructor.call(this,globe);
}

// Inheritance
Utils.inherits(TiledVectorRenderer,PolygonRenderer);

/**************************************************************************************************************/

/**
	Check if renderer is applicable
 */
PolygonRenderer.prototype.canApply = function(type,style)
{
	return style.fill && (type == "Polygon" || type == "MultiPolygon");
}

/**************************************************************************************************************/

/**
	Bucket constructor for PolygonRenderer
 */
var PolygonBucket = function(layer,style)
{
	this.layer = layer;
	this.style = new FeatureStyle(style);
	this.renderer = null;
}

/**************************************************************************************************************/

/**
	Create a renderable for this bucket
 */
PolygonBucket.prototype.createRenderable = function()
{
	return new PolygonRenderable(this);
}

/**************************************************************************************************************/

/**
	Check if a bucket is compatible
 */
PolygonBucket.prototype.isCompatible = function(style)
{
	return this.style.fillColor[0] == style.fillColor[0]
		&& this.style.fillColor[1] == style.fillColor[1]
		&& this.style.fillColor[2] == style.fillColor[2]
		&& this.style.fillColor[3] == style.fillColor[3];
}

/**************************************************************************************************************/

/**
	Get or create a bucket to store a feature with the given style
 */
PolygonRenderer.prototype.createBucket = function( layer, style )
{
	// Create a bucket
	return new PolygonBucket(layer,style);
}

/**************************************************************************************************************/

// Register the renderer
VectorRendererManager.factory.push( function(globe) { return new PolygonRenderer(globe); } );
				
return PolygonRenderable;
				
});
