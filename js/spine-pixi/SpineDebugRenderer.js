/** ****************************************************************************
 * Spine Runtimes License Agreement
 * Last updated July 28, 2023. Replaces all prior versions.
 *
 * Copyright (c) 2013-2023, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software or
 * otherwise create derivative works of the Spine Runtimes (collectively,
 * "Products"), provided that each user of the Products must obtain their own
 * Spine Editor license and redistribution of the Products in any form must
 * include this license and copyright notice.
 *
 * THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES,
 * BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THE
 * SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/
import { Container, Graphics, Text } from 'pixi.js';
import { ClippingAttachment, MeshAttachment, PathAttachment, RegionAttachment, SkeletonBounds } from '@esotericsoftware/spine-core';
/**
 * This is a debug renderer that uses PixiJS Graphics under the hood.
 * @public
 */
export class SpineDebugRenderer {
    registeredSpines = new Map();
    drawMeshHull = true;
    drawMeshTriangles = true;
    drawBones = true;
    drawPaths = true;
    drawBoundingBoxes = true;
    drawClipping = true;
    drawRegionAttachments = true;
    drawEvents = true;
    lineWidth = 1;
    regionAttachmentsColor = 0x0078ff;
    meshHullColor = 0x0078ff;
    meshTrianglesColor = 0xffcc00;
    clippingPolygonColor = 0xff00ff;
    boundingBoxesRectColor = 0x00ff00;
    boundingBoxesPolygonColor = 0x00ff00;
    boundingBoxesCircleColor = 0x00ff00;
    pathsCurveColor = 0xff0000;
    pathsLineColor = 0xff00ff;
    skeletonXYColor = 0xff0000;
    bonesColor = 0x00eecc;
    eventFontSize = 24;
    eventFontColor = 0x0;
    /**
     * The debug is attached by force to each spine object.
     * So we need to create it inside the spine when we get the first update
     */
    registerSpine(spine) {
        if (this.registeredSpines.has(spine)) {
            console.warn('SpineDebugRenderer.registerSpine() - this spine is already registered!', spine);
            return;
        }
        const debugDisplayObjects = {
            parentDebugContainer: new Container(),
            bones: new Container(),
            skeletonXY: new Graphics(),
            regionAttachmentsShape: new Graphics(),
            meshTrianglesLine: new Graphics(),
            meshHullLine: new Graphics(),
            clippingPolygon: new Graphics(),
            boundingBoxesRect: new Graphics(),
            boundingBoxesCircle: new Graphics(),
            boundingBoxesPolygon: new Graphics(),
            pathsCurve: new Graphics(),
            pathsLine: new Graphics(),
            eventText: new Container(),
            eventCallback: {
                event: (_, event) => {
                    if (this.drawEvents) {
                        const scale = Math.abs(spine.scale.x || spine.scale.y || 1);
                        const text = new Text({
                            text: event.data.name,
                            style: {
                                fontSize: this.eventFontSize / scale,
                                fill: this.eventFontColor,
                                fontFamily: 'monospace'
                            }
                        });
                        text.scale.x = Math.sign(spine.scale.x);
                        text.anchor.set(0.5);
                        debugDisplayObjects.eventText.addChild(text);
                        setTimeout(() => {
                            if (!text.destroyed) {
                                text.destroy();
                            }
                        }, 250);
                    }
                },
            },
        };
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.bones);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.skeletonXY);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.regionAttachmentsShape);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.meshTrianglesLine);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.meshHullLine);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.clippingPolygon);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.boundingBoxesRect);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.boundingBoxesCircle);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.boundingBoxesPolygon);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.pathsCurve);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.pathsLine);
        debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.eventText);
        debugDisplayObjects.parentDebugContainer.zIndex = 9999999;
        // Disable screen reader and mouse input on debug objects.
        debugDisplayObjects.parentDebugContainer.accessibleChildren = false;
        debugDisplayObjects.parentDebugContainer.eventMode = 'none';
        debugDisplayObjects.parentDebugContainer.interactiveChildren = false;
        spine.addChild(debugDisplayObjects.parentDebugContainer);
        spine.state.addListener(debugDisplayObjects.eventCallback);
        this.registeredSpines.set(spine, debugDisplayObjects);
    }
    renderDebug(spine) {
        if (!this.registeredSpines.has(spine)) {
            // This should never happen. Spines are registered when you assign spine.debug
            this.registerSpine(spine);
        }
        const debugDisplayObjects = this.registeredSpines.get(spine);
        if (!debugDisplayObjects) {
            return;
        }
        spine.addChild(debugDisplayObjects.parentDebugContainer);
        debugDisplayObjects.skeletonXY.clear();
        debugDisplayObjects.regionAttachmentsShape.clear();
        debugDisplayObjects.meshTrianglesLine.clear();
        debugDisplayObjects.meshHullLine.clear();
        debugDisplayObjects.clippingPolygon.clear();
        debugDisplayObjects.boundingBoxesRect.clear();
        debugDisplayObjects.boundingBoxesCircle.clear();
        debugDisplayObjects.boundingBoxesPolygon.clear();
        debugDisplayObjects.pathsCurve.clear();
        debugDisplayObjects.pathsLine.clear();
        for (let len = debugDisplayObjects.bones.children.length; len > 0; len--) {
            debugDisplayObjects.bones.children[len - 1].destroy({ children: true, texture: true, textureSource: true });
        }
        const scale = Math.abs(spine.scale.x || spine.scale.y || 1);
        const lineWidth = this.lineWidth / scale;
        if (this.drawBones) {
            this.drawBonesFunc(spine, debugDisplayObjects, lineWidth, scale);
        }
        if (this.drawPaths) {
            this.drawPathsFunc(spine, debugDisplayObjects, lineWidth);
        }
        if (this.drawBoundingBoxes) {
            this.drawBoundingBoxesFunc(spine, debugDisplayObjects, lineWidth);
        }
        if (this.drawClipping) {
            this.drawClippingFunc(spine, debugDisplayObjects, lineWidth);
        }
        if (this.drawMeshHull || this.drawMeshTriangles) {
            this.drawMeshHullAndMeshTriangles(spine, debugDisplayObjects, lineWidth);
        }
        if (this.drawRegionAttachments) {
            this.drawRegionAttachmentsFunc(spine, debugDisplayObjects, lineWidth);
        }
        if (this.drawEvents) {
            for (const child of debugDisplayObjects.eventText.children) {
                child.alpha -= 0.05;
                child.y -= 2;
            }
        }
    }
    drawBonesFunc(spine, debugDisplayObjects, lineWidth, scale) {
        const skeleton = spine.skeleton;
        const skeletonX = skeleton.x;
        const skeletonY = skeleton.y;
        const bones = skeleton.bones;
        debugDisplayObjects.skeletonXY.strokeStyle = { width: lineWidth, color: this.skeletonXYColor };
        for (let i = 0, len = bones.length; i < len; i++) {
            const bone = bones[i];
            const boneLen = bone.data.length;
            const starX = skeletonX + bone.worldX;
            const starY = skeletonY + bone.worldY;
            const endX = skeletonX + (boneLen * bone.a) + bone.worldX;
            const endY = skeletonY + (boneLen * bone.b) + bone.worldY;
            if (bone.data.name === 'root' || bone.data.parent === null) {
                continue;
            }
            const w = Math.abs(starX - endX);
            const h = Math.abs(starY - endY);
            // a = w, // side length a
            const a2 = Math.pow(w, 2); // square root of side length a
            const b = h; // side length b
            const b2 = Math.pow(h, 2); // square root of side length b
            const c = Math.sqrt(a2 + b2); // side length c
            const c2 = Math.pow(c, 2); // square root of side length c
            const rad = Math.PI / 180;
            // A = Math.acos([a2 + c2 - b2] / [2 * a * c]) || 0, // Angle A
            // C = Math.acos([a2 + b2 - c2] / [2 * a * b]) || 0, // C angle
            const B = Math.acos((c2 + b2 - a2) / (2 * b * c)) || 0; // angle of corner B
            if (c === 0) {
                continue;
            }
            const gp = new Graphics();
            debugDisplayObjects.bones.addChild(gp);
            // draw bone
            const refRation = c / 50 / scale;
            gp.context
                .poly([0, 0, 0 - refRation, c - (refRation * 3), 0, c - refRation, 0 + refRation, c - (refRation * 3)])
                .fill(this.bonesColor);
            gp.x = starX;
            gp.y = starY;
            gp.pivot.y = c;
            // Calculate bone rotation angle
            let rotation = 0;
            if (starX < endX && starY < endY) {
                // bottom right
                rotation = -B + (180 * rad);
            }
            else if (starX > endX && starY < endY) {
                // bottom left
                rotation = (180 * rad) + B;
            }
            else if (starX > endX && starY > endY) {
                // top left
                rotation = -B;
            }
            else if (starX < endX && starY > endY) {
                // bottom left
                rotation = B;
            }
            else if (starY === endY && starX < endX) {
                // To the right
                rotation = 90 * rad;
            }
            else if (starY === endY && starX > endX) {
                // go left
                rotation = -90 * rad;
            }
            else if (starX === endX && starY < endY) {
                // down
                rotation = 180 * rad;
            }
            else if (starX === endX && starY > endY) {
                // up
                rotation = 0;
            }
            gp.rotation = rotation;
            // Draw the starting rotation point of the bone
            gp.circle(0, c, refRation * 1.2)
                .fill({ color: 0x000000, alpha: 0.6 })
                .stroke({ width: lineWidth + refRation / 2.4, color: this.bonesColor });
        }
        // Draw the skeleton starting point "X" form
        const startDotSize = lineWidth * 3;
        debugDisplayObjects.skeletonXY.context
            .moveTo(skeletonX - startDotSize, skeletonY - startDotSize)
            .lineTo(skeletonX + startDotSize, skeletonY + startDotSize)
            .moveTo(skeletonX + startDotSize, skeletonY - startDotSize)
            .lineTo(skeletonX - startDotSize, skeletonY + startDotSize)
            .stroke();
    }
    drawRegionAttachmentsFunc(spine, debugDisplayObjects, lineWidth) {
        const skeleton = spine.skeleton;
        const slots = skeleton.slots;
        for (let i = 0, len = slots.length; i < len; i++) {
            const slot = slots[i];
            const attachment = slot.getAttachment();
            if (attachment === null || !(attachment instanceof RegionAttachment)) {
                continue;
            }
            const regionAttachment = attachment;
            const vertices = new Float32Array(8);
            regionAttachment.computeWorldVertices(slot, vertices, 0, 2);
            debugDisplayObjects.regionAttachmentsShape.poly(Array.from(vertices.slice(0, 8)));
        }
        debugDisplayObjects.regionAttachmentsShape.stroke({
            color: this.regionAttachmentsColor,
            width: lineWidth
        });
    }
    drawMeshHullAndMeshTriangles(spine, debugDisplayObjects, lineWidth) {
        const skeleton = spine.skeleton;
        const slots = skeleton.slots;
        for (let i = 0, len = slots.length; i < len; i++) {
            const slot = slots[i];
            if (!slot.bone.active) {
                continue;
            }
            const attachment = slot.getAttachment();
            if (attachment === null || !(attachment instanceof MeshAttachment)) {
                continue;
            }
            const meshAttachment = attachment;
            const vertices = new Float32Array(meshAttachment.worldVerticesLength);
            const triangles = meshAttachment.triangles;
            let hullLength = meshAttachment.hullLength;
            meshAttachment.computeWorldVertices(slot, 0, meshAttachment.worldVerticesLength, vertices, 0, 2);
            // draw the skinned mesh (triangle)
            if (this.drawMeshTriangles) {
                for (let i = 0, len = triangles.length; i < len; i += 3) {
                    const v1 = triangles[i] * 2;
                    const v2 = triangles[i + 1] * 2;
                    const v3 = triangles[i + 2] * 2;
                    debugDisplayObjects.meshTrianglesLine.context
                        .moveTo(vertices[v1], vertices[v1 + 1])
                        .lineTo(vertices[v2], vertices[v2 + 1])
                        .lineTo(vertices[v3], vertices[v3 + 1]);
                }
            }
            // draw skin border
            if (this.drawMeshHull && hullLength > 0) {
                hullLength = (hullLength >> 1) * 2;
                let lastX = vertices[hullLength - 2];
                let lastY = vertices[hullLength - 1];
                for (let i = 0, len = hullLength; i < len; i += 2) {
                    const x = vertices[i];
                    const y = vertices[i + 1];
                    debugDisplayObjects.meshHullLine.context
                        .moveTo(x, y)
                        .lineTo(lastX, lastY);
                    lastX = x;
                    lastY = y;
                }
            }
        }
        debugDisplayObjects.meshHullLine.stroke({ width: lineWidth, color: this.meshHullColor });
        debugDisplayObjects.meshTrianglesLine.stroke({ width: lineWidth, color: this.meshTrianglesColor });
    }
    drawClippingFunc(spine, debugDisplayObjects, lineWidth) {
        const skeleton = spine.skeleton;
        const slots = skeleton.slots;
        for (let i = 0, len = slots.length; i < len; i++) {
            const slot = slots[i];
            if (!slot.bone.active) {
                continue;
            }
            const attachment = slot.getAttachment();
            if (attachment === null || !(attachment instanceof ClippingAttachment)) {
                continue;
            }
            const clippingAttachment = attachment;
            const nn = clippingAttachment.worldVerticesLength;
            const world = new Float32Array(nn);
            clippingAttachment.computeWorldVertices(slot, 0, nn, world, 0, 2);
            debugDisplayObjects.clippingPolygon.poly(Array.from(world));
        }
        debugDisplayObjects.clippingPolygon.stroke({
            width: lineWidth, color: this.clippingPolygonColor, alpha: 1
        });
    }
    drawBoundingBoxesFunc(spine, debugDisplayObjects, lineWidth) {
        // draw the total outline of the bounding box
        const bounds = new SkeletonBounds();
        bounds.update(spine.skeleton, true);
        if (bounds.minX !== Infinity) {
            debugDisplayObjects.boundingBoxesRect
                .rect(bounds.minX, bounds.minY, bounds.getWidth(), bounds.getHeight())
                .stroke({ width: lineWidth, color: this.boundingBoxesRectColor });
        }
        const polygons = bounds.polygons;
        const drawPolygon = (polygonVertices, _offset, count) => {
            if (count < 3) {
                throw new Error('Polygon must contain at least 3 vertices');
            }
            const paths = [];
            const dotSize = lineWidth * 2;
            for (let i = 0, len = polygonVertices.length; i < len; i += 2) {
                const x1 = polygonVertices[i];
                const y1 = polygonVertices[i + 1];
                // draw the bounding box node
                debugDisplayObjects.boundingBoxesCircle.beginFill(this.boundingBoxesCircleColor);
                debugDisplayObjects.boundingBoxesCircle.drawCircle(x1, y1, dotSize);
                debugDisplayObjects.boundingBoxesCircle.fill(0);
                debugDisplayObjects.boundingBoxesCircle
                    .circle(x1, y1, dotSize)
                    .fill({ color: this.boundingBoxesCircleColor });
                paths.push(x1, y1);
            }
            // draw the bounding box area
            debugDisplayObjects.boundingBoxesPolygon
                .poly(paths)
                .fill({
                color: this.boundingBoxesPolygonColor,
                alpha: 0.1
            })
                .stroke({
                width: lineWidth,
                color: this.boundingBoxesPolygonColor
            });
        };
        for (let i = 0, len = polygons.length; i < len; i++) {
            const polygon = polygons[i];
            drawPolygon(polygon, 0, polygon.length);
        }
    }
    drawPathsFunc(spine, debugDisplayObjects, lineWidth) {
        const skeleton = spine.skeleton;
        const slots = skeleton.slots;
        for (let i = 0, len = slots.length; i < len; i++) {
            const slot = slots[i];
            if (!slot.bone.active) {
                continue;
            }
            const attachment = slot.getAttachment();
            if (attachment === null || !(attachment instanceof PathAttachment)) {
                continue;
            }
            const pathAttachment = attachment;
            let nn = pathAttachment.worldVerticesLength;
            const world = new Float32Array(nn);
            pathAttachment.computeWorldVertices(slot, 0, nn, world, 0, 2);
            let x1 = world[2];
            let y1 = world[3];
            let x2 = 0;
            let y2 = 0;
            if (pathAttachment.closed) {
                const cx1 = world[0];
                const cy1 = world[1];
                const cx2 = world[nn - 2];
                const cy2 = world[nn - 1];
                x2 = world[nn - 4];
                y2 = world[nn - 3];
                // curve
                debugDisplayObjects.pathsCurve.moveTo(x1, y1);
                debugDisplayObjects.pathsCurve.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
                // handle
                debugDisplayObjects.pathsLine.moveTo(x1, y1);
                debugDisplayObjects.pathsLine.lineTo(cx1, cy1);
                debugDisplayObjects.pathsLine.moveTo(x2, y2);
                debugDisplayObjects.pathsLine.lineTo(cx2, cy2);
            }
            nn -= 4;
            for (let ii = 4; ii < nn; ii += 6) {
                const cx1 = world[ii];
                const cy1 = world[ii + 1];
                const cx2 = world[ii + 2];
                const cy2 = world[ii + 3];
                x2 = world[ii + 4];
                y2 = world[ii + 5];
                // curve
                debugDisplayObjects.pathsCurve.moveTo(x1, y1);
                debugDisplayObjects.pathsCurve.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
                // handle
                debugDisplayObjects.pathsLine.moveTo(x1, y1);
                debugDisplayObjects.pathsLine.lineTo(cx1, cy1);
                debugDisplayObjects.pathsLine.moveTo(x2, y2);
                debugDisplayObjects.pathsLine.lineTo(cx2, cy2);
                x1 = x2;
                y1 = y2;
            }
        }
        debugDisplayObjects.pathsCurve.stroke({ width: lineWidth, color: this.pathsCurveColor });
        debugDisplayObjects.pathsLine.stroke({ width: lineWidth, color: this.pathsLineColor });
    }
    unregisterSpine(spine) {
        if (!this.registeredSpines.has(spine)) {
            console.warn('SpineDebugRenderer.unregisterSpine() - spine is not registered, can\'t unregister!', spine);
        }
        const debugDisplayObjects = this.registeredSpines.get(spine);
        if (!debugDisplayObjects) {
            return;
        }
        spine.state.removeListener(debugDisplayObjects.eventCallback);
        debugDisplayObjects.parentDebugContainer.destroy({ textureSource: true, children: true, texture: true });
        this.registeredSpines.delete(spine);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3BpbmVEZWJ1Z1JlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1NwaW5lRGVidWdSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OytFQTJCK0U7QUFFL0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBRXBELE9BQU8sRUFDTixrQkFBa0IsRUFDbEIsY0FBYyxFQUNkLGNBQWMsRUFDZCxnQkFBZ0IsRUFDaEIsY0FBYyxFQUNkLE1BQU0sOEJBQThCLENBQUM7QUEwQ3RDOzs7R0FHRztBQUNILE1BQU0sT0FBTyxrQkFBa0I7SUFDYixnQkFBZ0IsR0FBb0MsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUV4RSxZQUFZLEdBQUcsSUFBSSxDQUFDO0lBQ3BCLGlCQUFpQixHQUFHLElBQUksQ0FBQztJQUN6QixTQUFTLEdBQUcsSUFBSSxDQUFDO0lBQ2pCLFNBQVMsR0FBRyxJQUFJLENBQUM7SUFDakIsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO0lBQ3pCLFlBQVksR0FBRyxJQUFJLENBQUM7SUFDcEIscUJBQXFCLEdBQUcsSUFBSSxDQUFDO0lBQzdCLFVBQVUsR0FBRyxJQUFJLENBQUM7SUFFbEIsU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNkLHNCQUFzQixHQUFHLFFBQVEsQ0FBQztJQUNsQyxhQUFhLEdBQUcsUUFBUSxDQUFDO0lBQ3pCLGtCQUFrQixHQUFHLFFBQVEsQ0FBQztJQUM5QixvQkFBb0IsR0FBRyxRQUFRLENBQUM7SUFDaEMsc0JBQXNCLEdBQUcsUUFBUSxDQUFDO0lBQ2xDLHlCQUF5QixHQUFHLFFBQVEsQ0FBQztJQUNyQyx3QkFBd0IsR0FBRyxRQUFRLENBQUM7SUFDcEMsZUFBZSxHQUFHLFFBQVEsQ0FBQztJQUMzQixjQUFjLEdBQUcsUUFBUSxDQUFDO0lBQzFCLGVBQWUsR0FBRyxRQUFRLENBQUM7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RSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUM7UUFFRCxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDekYsbUJBQW1CLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQ3hGLENBQUM7SUFFTSxlQUFlLENBQUUsS0FBWTtRQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0ZBQW9GLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0csQ0FBQztRQUNELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3RCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixPQUFPO1FBQ1IsQ0FBQztRQUVELEtBQUssQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRTlELG1CQUFtQixDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN6RyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbIi8qKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBTcGluZSBSdW50aW1lcyBMaWNlbnNlIEFncmVlbWVudFxuICogTGFzdCB1cGRhdGVkIEp1bHkgMjgsIDIwMjMuIFJlcGxhY2VzIGFsbCBwcmlvciB2ZXJzaW9ucy5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMywgRXNvdGVyaWMgU29mdHdhcmUgTExDXG4gKlxuICogSW50ZWdyYXRpb24gb2YgdGhlIFNwaW5lIFJ1bnRpbWVzIGludG8gc29mdHdhcmUgb3Igb3RoZXJ3aXNlIGNyZWF0aW5nXG4gKiBkZXJpdmF0aXZlIHdvcmtzIG9mIHRoZSBTcGluZSBSdW50aW1lcyBpcyBwZXJtaXR0ZWQgdW5kZXIgdGhlIHRlcm1zIGFuZFxuICogY29uZGl0aW9ucyBvZiBTZWN0aW9uIDIgb2YgdGhlIFNwaW5lIEVkaXRvciBMaWNlbnNlIEFncmVlbWVudDpcbiAqIGh0dHA6Ly9lc290ZXJpY3NvZnR3YXJlLmNvbS9zcGluZS1lZGl0b3ItbGljZW5zZVxuICpcbiAqIE90aGVyd2lzZSwgaXQgaXMgcGVybWl0dGVkIHRvIGludGVncmF0ZSB0aGUgU3BpbmUgUnVudGltZXMgaW50byBzb2Z0d2FyZSBvclxuICogb3RoZXJ3aXNlIGNyZWF0ZSBkZXJpdmF0aXZlIHdvcmtzIG9mIHRoZSBTcGluZSBSdW50aW1lcyAoY29sbGVjdGl2ZWx5LFxuICogXCJQcm9kdWN0c1wiKSwgcHJvdmlkZWQgdGhhdCBlYWNoIHVzZXIgb2YgdGhlIFByb2R1Y3RzIG11c3Qgb2J0YWluIHRoZWlyIG93blxuICogU3BpbmUgRWRpdG9yIGxpY2Vuc2UgYW5kIHJlZGlzdHJpYnV0aW9uIG9mIHRoZSBQcm9kdWN0cyBpbiBhbnkgZm9ybSBtdXN0XG4gKiBpbmNsdWRlIHRoaXMgbGljZW5zZSBhbmQgY29weXJpZ2h0IG5vdGljZS5cbiAqXG4gKiBUSEUgU1BJTkUgUlVOVElNRVMgQVJFIFBST1ZJREVEIEJZIEVTT1RFUklDIFNPRlRXQVJFIExMQyBcIkFTIElTXCIgQU5EIEFOWVxuICogRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgRVNPVEVSSUMgU09GVFdBUkUgTExDIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTLFxuICogQlVTSU5FU1MgSU5URVJSVVBUSU9OLCBPUiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUykgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRIRVxuICogU1BJTkUgUlVOVElNRVMsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbmltcG9ydCB7IENvbnRhaW5lciwgR3JhcGhpY3MsIFRleHQgfSBmcm9tICdwaXhpLmpzJztcbmltcG9ydCB7IFNwaW5lIH0gZnJvbSAnLi9TcGluZSc7XG5pbXBvcnQge1xuXHRDbGlwcGluZ0F0dGFjaG1lbnQsXG5cdE1lc2hBdHRhY2htZW50LFxuXHRQYXRoQXR0YWNobWVudCxcblx0UmVnaW9uQXR0YWNobWVudCxcblx0U2tlbGV0b25Cb3VuZHNcbn0gZnJvbSAnQGVzb3Rlcmljc29mdHdhcmUvc3BpbmUtY29yZSc7XG5cbmltcG9ydCB0eXBlIHsgQW5pbWF0aW9uU3RhdGVMaXN0ZW5lciB9IGZyb20gJ0Blc290ZXJpY3NvZnR3YXJlL3NwaW5lLWNvcmUnO1xuXG4vKipcbiAqIE1ha2UgYSBjbGFzcyB0aGF0IGV4dGVuZHMgZnJvbSB0aGlzIGludGVyZmFjZSB0byBjcmVhdGUgeW91ciBvd24gZGVidWcgcmVuZGVyZXIuXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNwaW5lRGVidWdSZW5kZXJlciB7XG5cdC8qKlxuXHQgKiBUaGlzIHdpbGwgYmUgY2FsbGVkIGV2ZXJ5IGZyYW1lLCBhZnRlciB0aGUgc3BpbmUgaGFzIGJlZW4gdXBkYXRlZC5cblx0ICovXG5cdHJlbmRlckRlYnVnOiAoc3BpbmU6IFNwaW5lKSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiAgVGhpcyBpcyBjYWxsZWQgd2hlbiB0aGUgYHNwaW5lLmRlYnVnYCBvYmplY3QgaXMgc2V0IHRvIG51bGwgb3Igd2hlbiB0aGUgc3BpbmUgaXMgZGVzdHJveWVkLlxuXHQgKi9cblx0dW5yZWdpc3RlclNwaW5lOiAoc3BpbmU6IFNwaW5lKSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBUaGlzIGlzIGNhbGxlZCB3aGVuIHRoZSBgc3BpbmUuZGVidWdgIG9iamVjdCBpcyBzZXQgdG8gYSBuZXcgaW5zdGFuY2Ugb2YgYSBkZWJ1ZyByZW5kZXJlci5cblx0ICovXG5cdHJlZ2lzdGVyU3BpbmU6IChzcGluZTogU3BpbmUpID0+IHZvaWQ7XG59XG5cbnR5cGUgRGVidWdEaXNwbGF5T2JqZWN0cyA9IHtcblx0Ym9uZXM6IENvbnRhaW5lcjtcblx0c2tlbGV0b25YWTogR3JhcGhpY3M7XG5cdHJlZ2lvbkF0dGFjaG1lbnRzU2hhcGU6IEdyYXBoaWNzO1xuXHRtZXNoVHJpYW5nbGVzTGluZTogR3JhcGhpY3M7XG5cdG1lc2hIdWxsTGluZTogR3JhcGhpY3M7XG5cdGNsaXBwaW5nUG9seWdvbjogR3JhcGhpY3M7XG5cdGJvdW5kaW5nQm94ZXNSZWN0OiBHcmFwaGljcztcblx0Ym91bmRpbmdCb3hlc0NpcmNsZTogR3JhcGhpY3M7XG5cdGJvdW5kaW5nQm94ZXNQb2x5Z29uOiBHcmFwaGljcztcblx0cGF0aHNDdXJ2ZTogR3JhcGhpY3M7XG5cdHBhdGhzTGluZTogR3JhcGhpY3M7XG5cdHBhcmVudERlYnVnQ29udGFpbmVyOiBDb250YWluZXI7XG5cdGV2ZW50VGV4dDogQ29udGFpbmVyO1xuXHRldmVudENhbGxiYWNrOiBBbmltYXRpb25TdGF0ZUxpc3RlbmVyO1xufTtcblxuLyoqXG4gKiBUaGlzIGlzIGEgZGVidWcgcmVuZGVyZXIgdGhhdCB1c2VzIFBpeGlKUyBHcmFwaGljcyB1bmRlciB0aGUgaG9vZC5cbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGNsYXNzIFNwaW5lRGVidWdSZW5kZXJlciBpbXBsZW1lbnRzIElTcGluZURlYnVnUmVuZGVyZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdGVyZWRTcGluZXM6IE1hcDxTcGluZSwgRGVidWdEaXNwbGF5T2JqZWN0cz4gPSBuZXcgTWFwKCk7XG5cblx0cHVibGljIGRyYXdNZXNoSHVsbCA9IHRydWU7XG5cdHB1YmxpYyBkcmF3TWVzaFRyaWFuZ2xlcyA9IHRydWU7XG5cdHB1YmxpYyBkcmF3Qm9uZXMgPSB0cnVlO1xuXHRwdWJsaWMgZHJhd1BhdGhzID0gdHJ1ZTtcblx0cHVibGljIGRyYXdCb3VuZGluZ0JveGVzID0gdHJ1ZTtcblx0cHVibGljIGRyYXdDbGlwcGluZyA9IHRydWU7XG5cdHB1YmxpYyBkcmF3UmVnaW9uQXR0YWNobWVudHMgPSB0cnVlO1xuXHRwdWJsaWMgZHJhd0V2ZW50cyA9IHRydWU7XG5cblx0cHVibGljIGxpbmVXaWR0aCA9IDE7XG5cdHB1YmxpYyByZWdpb25BdHRhY2htZW50c0NvbG9yID0gMHgwMDc4ZmY7XG5cdHB1YmxpYyBtZXNoSHVsbENvbG9yID0gMHgwMDc4ZmY7XG5cdHB1YmxpYyBtZXNoVHJpYW5nbGVzQ29sb3IgPSAweGZmY2MwMDtcblx0cHVibGljIGNsaXBwaW5nUG9seWdvbkNvbG9yID0gMHhmZjAwZmY7XG5cdHB1YmxpYyBib3VuZGluZ0JveGVzUmVjdENvbG9yID0gMHgwMGZmMDA7XG5cdHB1YmxpYyBib3VuZGluZ0JveGVzUG9seWdvbkNvbG9yID0gMHgwMGZmMDA7XG5cdHB1YmxpYyBib3VuZGluZ0JveGVzQ2lyY2xlQ29sb3IgPSAweDAwZmYwMDtcblx0cHVibGljIHBhdGhzQ3VydmVDb2xvciA9IDB4ZmYwMDAwO1xuXHRwdWJsaWMgcGF0aHNMaW5lQ29sb3IgPSAweGZmMDBmZjtcblx0cHVibGljIHNrZWxldG9uWFlDb2xvciA9IDB4ZmYwMDAwO1xuXHRwdWJsaWMgYm9uZXNDb2xvciA9IDB4MDBlZWNjO1xuXHRwdWJsaWMgZXZlbnRGb250U2l6ZSA9IDI0O1xuXHRwdWJsaWMgZXZlbnRGb250Q29sb3IgPSAweDA7XG5cblx0LyoqXG5cdCAqIFRoZSBkZWJ1ZyBpcyBhdHRhY2hlZCBieSBmb3JjZSB0byBlYWNoIHNwaW5lIG9iamVjdC5cblx0ICogU28gd2UgbmVlZCB0byBjcmVhdGUgaXQgaW5zaWRlIHRoZSBzcGluZSB3aGVuIHdlIGdldCB0aGUgZmlyc3QgdXBkYXRlXG5cdCAqL1xuXHRwdWJsaWMgcmVnaXN0ZXJTcGluZSAoc3BpbmU6IFNwaW5lKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmVnaXN0ZXJlZFNwaW5lcy5oYXMoc3BpbmUpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ1NwaW5lRGVidWdSZW5kZXJlci5yZWdpc3RlclNwaW5lKCkgLSB0aGlzIHNwaW5lIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCEnLCBzcGluZSk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVidWdEaXNwbGF5T2JqZWN0czogRGVidWdEaXNwbGF5T2JqZWN0cyA9IHtcblx0XHRcdHBhcmVudERlYnVnQ29udGFpbmVyOiBuZXcgQ29udGFpbmVyKCksXG5cdFx0XHRib25lczogbmV3IENvbnRhaW5lcigpLFxuXHRcdFx0c2tlbGV0b25YWTogbmV3IEdyYXBoaWNzKCksXG5cdFx0XHRyZWdpb25BdHRhY2htZW50c1NoYXBlOiBuZXcgR3JhcGhpY3MoKSxcblx0XHRcdG1lc2hUcmlhbmdsZXNMaW5lOiBuZXcgR3JhcGhpY3MoKSxcblx0XHRcdG1lc2hIdWxsTGluZTogbmV3IEdyYXBoaWNzKCksXG5cdFx0XHRjbGlwcGluZ1BvbHlnb246IG5ldyBHcmFwaGljcygpLFxuXHRcdFx0Ym91bmRpbmdCb3hlc1JlY3Q6IG5ldyBHcmFwaGljcygpLFxuXHRcdFx0Ym91bmRpbmdCb3hlc0NpcmNsZTogbmV3IEdyYXBoaWNzKCksXG5cdFx0XHRib3VuZGluZ0JveGVzUG9seWdvbjogbmV3IEdyYXBoaWNzKCksXG5cdFx0XHRwYXRoc0N1cnZlOiBuZXcgR3JhcGhpY3MoKSxcblx0XHRcdHBhdGhzTGluZTogbmV3IEdyYXBoaWNzKCksXG5cdFx0XHRldmVudFRleHQ6IG5ldyBDb250YWluZXIoKSxcblx0XHRcdGV2ZW50Q2FsbGJhY2s6IHtcblx0XHRcdFx0ZXZlbnQ6IChfLCBldmVudCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmRyYXdFdmVudHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNjYWxlID0gTWF0aC5hYnMoc3BpbmUuc2NhbGUueCB8fCBzcGluZS5zY2FsZS55IHx8IDEpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdGV4dCA9IG5ldyBUZXh0KHtcblx0XHRcdFx0XHRcdFx0dGV4dDogZXZlbnQuZGF0YS5uYW1lLFxuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdGZvbnRTaXplOiB0aGlzLmV2ZW50Rm9udFNpemUgLyBzY2FsZSxcblx0XHRcdFx0XHRcdFx0XHRmaWxsOiB0aGlzLmV2ZW50Rm9udENvbG9yLFxuXHRcdFx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHR0ZXh0LnNjYWxlLnggPSBNYXRoLnNpZ24oc3BpbmUuc2NhbGUueCk7XG5cdFx0XHRcdFx0XHR0ZXh0LmFuY2hvci5zZXQoMC41KTtcblx0XHRcdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMuZXZlbnRUZXh0LmFkZENoaWxkKHRleHQpO1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghdGV4dC5kZXN0cm95ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0LmRlc3Ryb3koKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSwgMjUwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMuYm9uZXMpO1xuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGFyZW50RGVidWdDb250YWluZXIuYWRkQ2hpbGQoZGVidWdEaXNwbGF5T2JqZWN0cy5za2VsZXRvblhZKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMucmVnaW9uQXR0YWNobWVudHNTaGFwZSk7XG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXJlbnREZWJ1Z0NvbnRhaW5lci5hZGRDaGlsZChkZWJ1Z0Rpc3BsYXlPYmplY3RzLm1lc2hUcmlhbmdsZXNMaW5lKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMubWVzaEh1bGxMaW5lKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMuY2xpcHBpbmdQb2x5Z29uKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMuYm91bmRpbmdCb3hlc1JlY3QpO1xuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGFyZW50RGVidWdDb250YWluZXIuYWRkQ2hpbGQoZGVidWdEaXNwbGF5T2JqZWN0cy5ib3VuZGluZ0JveGVzQ2lyY2xlKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMuYm91bmRpbmdCb3hlc1BvbHlnb24pO1xuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGFyZW50RGVidWdDb250YWluZXIuYWRkQ2hpbGQoZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0N1cnZlKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMucGF0aHNMaW5lKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyLmFkZENoaWxkKGRlYnVnRGlzcGxheU9iamVjdHMuZXZlbnRUZXh0KTtcblxuXHRcdChkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyIGFzIGFueSkuekluZGV4ID0gOTk5OTk5OTtcblxuXHRcdC8vIERpc2FibGUgc2NyZWVuIHJlYWRlciBhbmQgbW91c2UgaW5wdXQgb24gZGVidWcgb2JqZWN0cy5cblx0XHQoZGVidWdEaXNwbGF5T2JqZWN0cy5wYXJlbnREZWJ1Z0NvbnRhaW5lciBhcyBhbnkpLmFjY2Vzc2libGVDaGlsZHJlbiA9IGZhbHNlO1xuXHRcdChkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyIGFzIGFueSkuZXZlbnRNb2RlID0gJ25vbmUnO1xuXHRcdChkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhcmVudERlYnVnQ29udGFpbmVyIGFzIGFueSkuaW50ZXJhY3RpdmVDaGlsZHJlbiA9IGZhbHNlO1xuXG5cdFx0c3BpbmUuYWRkQ2hpbGQoZGVidWdEaXNwbGF5T2JqZWN0cy5wYXJlbnREZWJ1Z0NvbnRhaW5lcik7XG5cblx0XHRzcGluZS5zdGF0ZS5hZGRMaXN0ZW5lcihkZWJ1Z0Rpc3BsYXlPYmplY3RzLmV2ZW50Q2FsbGJhY2spO1xuXG5cdFx0dGhpcy5yZWdpc3RlcmVkU3BpbmVzLnNldChzcGluZSwgZGVidWdEaXNwbGF5T2JqZWN0cyk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyRGVidWcgKHNwaW5lOiBTcGluZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZWdpc3RlcmVkU3BpbmVzLmhhcyhzcGluZSkpIHtcblx0XHRcdC8vIFRoaXMgc2hvdWxkIG5ldmVyIGhhcHBlbi4gU3BpbmVzIGFyZSByZWdpc3RlcmVkIHdoZW4geW91IGFzc2lnbiBzcGluZS5kZWJ1Z1xuXHRcdFx0dGhpcy5yZWdpc3RlclNwaW5lKHNwaW5lKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0Rpc3BsYXlPYmplY3RzID0gdGhpcy5yZWdpc3RlcmVkU3BpbmVzLmdldChzcGluZSk7XG5cblx0XHRpZiAoIWRlYnVnRGlzcGxheU9iamVjdHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c3BpbmUuYWRkQ2hpbGQoZGVidWdEaXNwbGF5T2JqZWN0cy5wYXJlbnREZWJ1Z0NvbnRhaW5lcik7XG5cblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnNrZWxldG9uWFkuY2xlYXIoKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnJlZ2lvbkF0dGFjaG1lbnRzU2hhcGUuY2xlYXIoKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLm1lc2hUcmlhbmdsZXNMaW5lLmNsZWFyKCk7XG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5tZXNoSHVsbExpbmUuY2xlYXIoKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLmNsaXBwaW5nUG9seWdvbi5jbGVhcigpO1xuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMuYm91bmRpbmdCb3hlc1JlY3QuY2xlYXIoKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLmJvdW5kaW5nQm94ZXNDaXJjbGUuY2xlYXIoKTtcblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLmJvdW5kaW5nQm94ZXNQb2x5Z29uLmNsZWFyKCk7XG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0N1cnZlLmNsZWFyKCk7XG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0xpbmUuY2xlYXIoKTtcblxuXHRcdGZvciAobGV0IGxlbiA9IGRlYnVnRGlzcGxheU9iamVjdHMuYm9uZXMuY2hpbGRyZW4ubGVuZ3RoOyBsZW4gPiAwOyBsZW4tLSkge1xuXHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5ib25lcy5jaGlsZHJlbltsZW4gLSAxXS5kZXN0cm95KHsgY2hpbGRyZW46IHRydWUsIHRleHR1cmU6IHRydWUsIHRleHR1cmVTb3VyY2U6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NhbGUgPSBNYXRoLmFicyhzcGluZS5zY2FsZS54IHx8IHNwaW5lLnNjYWxlLnkgfHwgMSk7XG5cdFx0Y29uc3QgbGluZVdpZHRoID0gdGhpcy5saW5lV2lkdGggLyBzY2FsZTtcblxuXHRcdGlmICh0aGlzLmRyYXdCb25lcykge1xuXHRcdFx0dGhpcy5kcmF3Qm9uZXNGdW5jKHNwaW5lLCBkZWJ1Z0Rpc3BsYXlPYmplY3RzLCBsaW5lV2lkdGgsIHNjYWxlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kcmF3UGF0aHMpIHtcblx0XHRcdHRoaXMuZHJhd1BhdGhzRnVuYyhzcGluZSwgZGVidWdEaXNwbGF5T2JqZWN0cywgbGluZVdpZHRoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kcmF3Qm91bmRpbmdCb3hlcykge1xuXHRcdFx0dGhpcy5kcmF3Qm91bmRpbmdCb3hlc0Z1bmMoc3BpbmUsIGRlYnVnRGlzcGxheU9iamVjdHMsIGxpbmVXaWR0aCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZHJhd0NsaXBwaW5nKSB7XG5cdFx0XHR0aGlzLmRyYXdDbGlwcGluZ0Z1bmMoc3BpbmUsIGRlYnVnRGlzcGxheU9iamVjdHMsIGxpbmVXaWR0aCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZHJhd01lc2hIdWxsIHx8IHRoaXMuZHJhd01lc2hUcmlhbmdsZXMpIHtcblx0XHRcdHRoaXMuZHJhd01lc2hIdWxsQW5kTWVzaFRyaWFuZ2xlcyhzcGluZSwgZGVidWdEaXNwbGF5T2JqZWN0cywgbGluZVdpZHRoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kcmF3UmVnaW9uQXR0YWNobWVudHMpIHtcblx0XHRcdHRoaXMuZHJhd1JlZ2lvbkF0dGFjaG1lbnRzRnVuYyhzcGluZSwgZGVidWdEaXNwbGF5T2JqZWN0cywgbGluZVdpZHRoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kcmF3RXZlbnRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGRlYnVnRGlzcGxheU9iamVjdHMuZXZlbnRUZXh0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNoaWxkLmFscGhhIC09IDAuMDU7XG5cdFx0XHRcdGNoaWxkLnkgLT0gMjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRyYXdCb25lc0Z1bmMgKHNwaW5lOiBTcGluZSwgZGVidWdEaXNwbGF5T2JqZWN0czogRGVidWdEaXNwbGF5T2JqZWN0cywgbGluZVdpZHRoOiBudW1iZXIsIHNjYWxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBza2VsZXRvbiA9IHNwaW5lLnNrZWxldG9uO1xuXHRcdGNvbnN0IHNrZWxldG9uWCA9IHNrZWxldG9uLng7XG5cdFx0Y29uc3Qgc2tlbGV0b25ZID0gc2tlbGV0b24ueTtcblx0XHRjb25zdCBib25lcyA9IHNrZWxldG9uLmJvbmVzO1xuXG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5za2VsZXRvblhZLnN0cm9rZVN0eWxlID0geyB3aWR0aDogbGluZVdpZHRoLCBjb2xvcjogdGhpcy5za2VsZXRvblhZQ29sb3IgfTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBib25lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgYm9uZSA9IGJvbmVzW2ldO1xuXHRcdFx0Y29uc3QgYm9uZUxlbiA9IGJvbmUuZGF0YS5sZW5ndGg7XG5cdFx0XHRjb25zdCBzdGFyWCA9IHNrZWxldG9uWCArIGJvbmUud29ybGRYO1xuXHRcdFx0Y29uc3Qgc3RhclkgPSBza2VsZXRvblkgKyBib25lLndvcmxkWTtcblx0XHRcdGNvbnN0IGVuZFggPSBza2VsZXRvblggKyAoYm9uZUxlbiAqIGJvbmUuYSkgKyBib25lLndvcmxkWDtcblx0XHRcdGNvbnN0IGVuZFkgPSBza2VsZXRvblkgKyAoYm9uZUxlbiAqIGJvbmUuYikgKyBib25lLndvcmxkWTtcblxuXHRcdFx0aWYgKGJvbmUuZGF0YS5uYW1lID09PSAncm9vdCcgfHwgYm9uZS5kYXRhLnBhcmVudCA9PT0gbnVsbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdyA9IE1hdGguYWJzKHN0YXJYIC0gZW5kWCk7XG5cdFx0XHRjb25zdCBoID0gTWF0aC5hYnMoc3RhclkgLSBlbmRZKTtcblx0XHRcdC8vIGEgPSB3LCAvLyBzaWRlIGxlbmd0aCBhXG5cdFx0XHRjb25zdCBhMiA9IE1hdGgucG93KHcsIDIpOyAvLyBzcXVhcmUgcm9vdCBvZiBzaWRlIGxlbmd0aCBhXG5cdFx0XHRjb25zdCBiID0gaDsgLy8gc2lkZSBsZW5ndGggYlxuXHRcdFx0Y29uc3QgYjIgPSBNYXRoLnBvdyhoLCAyKTsgLy8gc3F1YXJlIHJvb3Qgb2Ygc2lkZSBsZW5ndGggYlxuXHRcdFx0Y29uc3QgYyA9IE1hdGguc3FydChhMiArIGIyKTsgLy8gc2lkZSBsZW5ndGggY1xuXHRcdFx0Y29uc3QgYzIgPSBNYXRoLnBvdyhjLCAyKTsgLy8gc3F1YXJlIHJvb3Qgb2Ygc2lkZSBsZW5ndGggY1xuXHRcdFx0Y29uc3QgcmFkID0gTWF0aC5QSSAvIDE4MDtcblx0XHRcdC8vIEEgPSBNYXRoLmFjb3MoW2EyICsgYzIgLSBiMl0gLyBbMiAqIGEgKiBjXSkgfHwgMCwgLy8gQW5nbGUgQVxuXHRcdFx0Ly8gQyA9IE1hdGguYWNvcyhbYTIgKyBiMiAtIGMyXSAvIFsyICogYSAqIGJdKSB8fCAwLCAvLyBDIGFuZ2xlXG5cdFx0XHRjb25zdCBCID0gTWF0aC5hY29zKChjMiArIGIyIC0gYTIpIC8gKDIgKiBiICogYykpIHx8IDA7IC8vIGFuZ2xlIG9mIGNvcm5lciBCXG5cblx0XHRcdGlmIChjID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncCA9IG5ldyBHcmFwaGljcygpO1xuXG5cdFx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLmJvbmVzLmFkZENoaWxkKGdwKTtcblxuXHRcdFx0Ly8gZHJhdyBib25lXG5cdFx0XHRjb25zdCByZWZSYXRpb24gPSBjIC8gNTAgLyBzY2FsZTtcblxuXHRcdFx0Z3AuY29udGV4dFxuXHRcdFx0XHQucG9seShbMCwgMCwgMCAtIHJlZlJhdGlvbiwgYyAtIChyZWZSYXRpb24gKiAzKSwgMCwgYyAtIHJlZlJhdGlvbiwgMCArIHJlZlJhdGlvbiwgYyAtIChyZWZSYXRpb24gKiAzKV0pXG5cdFx0XHRcdC5maWxsKHRoaXMuYm9uZXNDb2xvcik7XG5cdFx0XHRncC54ID0gc3Rhclg7XG5cdFx0XHRncC55ID0gc3Rhclk7XG5cdFx0XHRncC5waXZvdC55ID0gYztcblxuXHRcdFx0Ly8gQ2FsY3VsYXRlIGJvbmUgcm90YXRpb24gYW5nbGVcblx0XHRcdGxldCByb3RhdGlvbiA9IDA7XG5cblx0XHRcdGlmIChzdGFyWCA8IGVuZFggJiYgc3RhclkgPCBlbmRZKSB7XG5cdFx0XHRcdC8vIGJvdHRvbSByaWdodFxuXHRcdFx0XHRyb3RhdGlvbiA9IC1CICsgKDE4MCAqIHJhZCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGFyWCA+IGVuZFggJiYgc3RhclkgPCBlbmRZKSB7XG5cdFx0XHRcdC8vIGJvdHRvbSBsZWZ0XG5cdFx0XHRcdHJvdGF0aW9uID0gKDE4MCAqIHJhZCkgKyBCO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhclggPiBlbmRYICYmIHN0YXJZID4gZW5kWSkge1xuXHRcdFx0XHQvLyB0b3AgbGVmdFxuXHRcdFx0XHRyb3RhdGlvbiA9IC1CO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhclggPCBlbmRYICYmIHN0YXJZID4gZW5kWSkge1xuXHRcdFx0XHQvLyBib3R0b20gbGVmdFxuXHRcdFx0XHRyb3RhdGlvbiA9IEI7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGFyWSA9PT0gZW5kWSAmJiBzdGFyWCA8IGVuZFgpIHtcblx0XHRcdFx0Ly8gVG8gdGhlIHJpZ2h0XG5cdFx0XHRcdHJvdGF0aW9uID0gOTAgKiByYWQ7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGFyWSA9PT0gZW5kWSAmJiBzdGFyWCA+IGVuZFgpIHtcblx0XHRcdFx0Ly8gZ28gbGVmdFxuXHRcdFx0XHRyb3RhdGlvbiA9IC05MCAqIHJhZDtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKHN0YXJYID09PSBlbmRYICYmIHN0YXJZIDwgZW5kWSkge1xuXHRcdFx0XHQvLyBkb3duXG5cdFx0XHRcdHJvdGF0aW9uID0gMTgwICogcmFkO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhclggPT09IGVuZFggJiYgc3RhclkgPiBlbmRZKSB7XG5cdFx0XHRcdC8vIHVwXG5cdFx0XHRcdHJvdGF0aW9uID0gMDtcblx0XHRcdH1cblx0XHRcdGdwLnJvdGF0aW9uID0gcm90YXRpb247XG5cblx0XHRcdC8vIERyYXcgdGhlIHN0YXJ0aW5nIHJvdGF0aW9uIHBvaW50IG9mIHRoZSBib25lXG5cdFx0XHRncC5jaXJjbGUoMCwgYywgcmVmUmF0aW9uICogMS4yKVxuXHRcdFx0XHQuZmlsbCh7IGNvbG9yOiAweDAwMDAwMCwgYWxwaGE6IDAuNiB9KVxuXHRcdFx0XHQuc3Ryb2tlKHsgd2lkdGg6IGxpbmVXaWR0aCArIHJlZlJhdGlvbiAvIDIuNCwgY29sb3I6IHRoaXMuYm9uZXNDb2xvciB9KTtcblx0XHR9XG5cblx0XHQvLyBEcmF3IHRoZSBza2VsZXRvbiBzdGFydGluZyBwb2ludCBcIlhcIiBmb3JtXG5cdFx0Y29uc3Qgc3RhcnREb3RTaXplID0gbGluZVdpZHRoICogMztcblxuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMuc2tlbGV0b25YWS5jb250ZXh0XG5cdFx0XHQubW92ZVRvKHNrZWxldG9uWCAtIHN0YXJ0RG90U2l6ZSwgc2tlbGV0b25ZIC0gc3RhcnREb3RTaXplKVxuXHRcdFx0LmxpbmVUbyhza2VsZXRvblggKyBzdGFydERvdFNpemUsIHNrZWxldG9uWSArIHN0YXJ0RG90U2l6ZSlcblx0XHRcdC5tb3ZlVG8oc2tlbGV0b25YICsgc3RhcnREb3RTaXplLCBza2VsZXRvblkgLSBzdGFydERvdFNpemUpXG5cdFx0XHQubGluZVRvKHNrZWxldG9uWCAtIHN0YXJ0RG90U2l6ZSwgc2tlbGV0b25ZICsgc3RhcnREb3RTaXplKVxuXHRcdFx0LnN0cm9rZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkcmF3UmVnaW9uQXR0YWNobWVudHNGdW5jIChzcGluZTogU3BpbmUsIGRlYnVnRGlzcGxheU9iamVjdHM6IERlYnVnRGlzcGxheU9iamVjdHMsIGxpbmVXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2tlbGV0b24gPSBzcGluZS5za2VsZXRvbjtcblx0XHRjb25zdCBzbG90cyA9IHNrZWxldG9uLnNsb3RzO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNsb3RzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzbG90ID0gc2xvdHNbaV07XG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cblx0XHRcdGlmIChhdHRhY2htZW50ID09PSBudWxsIHx8ICEoYXR0YWNobWVudCBpbnN0YW5jZW9mIFJlZ2lvbkF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZWdpb25BdHRhY2htZW50ID0gYXR0YWNobWVudDtcblxuXHRcdFx0Y29uc3QgdmVydGljZXMgPSBuZXcgRmxvYXQzMkFycmF5KDgpO1xuXG5cdFx0XHRyZWdpb25BdHRhY2htZW50LmNvbXB1dGVXb3JsZFZlcnRpY2VzKHNsb3QsIHZlcnRpY2VzLCAwLCAyKTtcblxuXHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5yZWdpb25BdHRhY2htZW50c1NoYXBlLnBvbHkoQXJyYXkuZnJvbSh2ZXJ0aWNlcy5zbGljZSgwLCA4KSkpO1xuXHRcdH1cblxuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMucmVnaW9uQXR0YWNobWVudHNTaGFwZS5zdHJva2Uoe1xuXHRcdFx0Y29sb3I6IHRoaXMucmVnaW9uQXR0YWNobWVudHNDb2xvcixcblx0XHRcdHdpZHRoOiBsaW5lV2lkdGhcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZHJhd01lc2hIdWxsQW5kTWVzaFRyaWFuZ2xlcyAoc3BpbmU6IFNwaW5lLCBkZWJ1Z0Rpc3BsYXlPYmplY3RzOiBEZWJ1Z0Rpc3BsYXlPYmplY3RzLCBsaW5lV2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNrZWxldG9uID0gc3BpbmUuc2tlbGV0b247XG5cdFx0Y29uc3Qgc2xvdHMgPSBza2VsZXRvbi5zbG90cztcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzbG90cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2xvdCA9IHNsb3RzW2ldO1xuXG5cdFx0XHRpZiAoIXNsb3QuYm9uZS5hY3RpdmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cblx0XHRcdGlmIChhdHRhY2htZW50ID09PSBudWxsIHx8ICEoYXR0YWNobWVudCBpbnN0YW5jZW9mIE1lc2hBdHRhY2htZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWVzaEF0dGFjaG1lbnQgPSBhdHRhY2htZW50O1xuXG5cdFx0XHRjb25zdCB2ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkobWVzaEF0dGFjaG1lbnQud29ybGRWZXJ0aWNlc0xlbmd0aCk7XG5cdFx0XHRjb25zdCB0cmlhbmdsZXMgPSBtZXNoQXR0YWNobWVudC50cmlhbmdsZXM7XG5cdFx0XHRsZXQgaHVsbExlbmd0aCA9IG1lc2hBdHRhY2htZW50Lmh1bGxMZW5ndGg7XG5cblx0XHRcdG1lc2hBdHRhY2htZW50LmNvbXB1dGVXb3JsZFZlcnRpY2VzKHNsb3QsIDAsIG1lc2hBdHRhY2htZW50LndvcmxkVmVydGljZXNMZW5ndGgsIHZlcnRpY2VzLCAwLCAyKTtcblx0XHRcdC8vIGRyYXcgdGhlIHNraW5uZWQgbWVzaCAodHJpYW5nbGUpXG5cdFx0XHRpZiAodGhpcy5kcmF3TWVzaFRyaWFuZ2xlcykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdHJpYW5nbGVzLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdjEgPSB0cmlhbmdsZXNbaV0gKiAyO1xuXHRcdFx0XHRcdGNvbnN0IHYyID0gdHJpYW5nbGVzW2kgKyAxXSAqIDI7XG5cdFx0XHRcdFx0Y29uc3QgdjMgPSB0cmlhbmdsZXNbaSArIDJdICogMjtcblxuXHRcdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMubWVzaFRyaWFuZ2xlc0xpbmUuY29udGV4dFxuXHRcdFx0XHRcdFx0Lm1vdmVUbyh2ZXJ0aWNlc1t2MV0sIHZlcnRpY2VzW3YxICsgMV0pXG5cdFx0XHRcdFx0XHQubGluZVRvKHZlcnRpY2VzW3YyXSwgdmVydGljZXNbdjIgKyAxXSlcblx0XHRcdFx0XHRcdC5saW5lVG8odmVydGljZXNbdjNdLCB2ZXJ0aWNlc1t2MyArIDFdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBkcmF3IHNraW4gYm9yZGVyXG5cdFx0XHRpZiAodGhpcy5kcmF3TWVzaEh1bGwgJiYgaHVsbExlbmd0aCA+IDApIHtcblx0XHRcdFx0aHVsbExlbmd0aCA9IChodWxsTGVuZ3RoID4+IDEpICogMjtcblx0XHRcdFx0bGV0IGxhc3RYID0gdmVydGljZXNbaHVsbExlbmd0aCAtIDJdO1xuXHRcdFx0XHRsZXQgbGFzdFkgPSB2ZXJ0aWNlc1todWxsTGVuZ3RoIC0gMV07XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGh1bGxMZW5ndGg7IGkgPCBsZW47IGkgKz0gMikge1xuXHRcdFx0XHRcdGNvbnN0IHggPSB2ZXJ0aWNlc1tpXTtcblx0XHRcdFx0XHRjb25zdCB5ID0gdmVydGljZXNbaSArIDFdO1xuXG5cdFx0XHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5tZXNoSHVsbExpbmUuY29udGV4dFxuXHRcdFx0XHRcdFx0Lm1vdmVUbyh4LCB5KVxuXHRcdFx0XHRcdFx0LmxpbmVUbyhsYXN0WCwgbGFzdFkpO1xuXHRcdFx0XHRcdGxhc3RYID0geDtcblx0XHRcdFx0XHRsYXN0WSA9IHk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLm1lc2hIdWxsTGluZS5zdHJva2UoeyB3aWR0aDogbGluZVdpZHRoLCBjb2xvcjogdGhpcy5tZXNoSHVsbENvbG9yIH0pO1xuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMubWVzaFRyaWFuZ2xlc0xpbmUuc3Ryb2tlKHsgd2lkdGg6IGxpbmVXaWR0aCwgY29sb3I6IHRoaXMubWVzaFRyaWFuZ2xlc0NvbG9yIH0pO1xuXHR9XG5cblx0ZHJhd0NsaXBwaW5nRnVuYyAoc3BpbmU6IFNwaW5lLCBkZWJ1Z0Rpc3BsYXlPYmplY3RzOiBEZWJ1Z0Rpc3BsYXlPYmplY3RzLCBsaW5lV2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNrZWxldG9uID0gc3BpbmUuc2tlbGV0b247XG5cdFx0Y29uc3Qgc2xvdHMgPSBza2VsZXRvbi5zbG90cztcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzbG90cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2xvdCA9IHNsb3RzW2ldO1xuXG5cdFx0XHRpZiAoIXNsb3QuYm9uZS5hY3RpdmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cblx0XHRcdGlmIChhdHRhY2htZW50ID09PSBudWxsIHx8ICEoYXR0YWNobWVudCBpbnN0YW5jZW9mIENsaXBwaW5nQXR0YWNobWVudCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsaXBwaW5nQXR0YWNobWVudCA9IGF0dGFjaG1lbnQ7XG5cblx0XHRcdGNvbnN0IG5uID0gY2xpcHBpbmdBdHRhY2htZW50LndvcmxkVmVydGljZXNMZW5ndGg7XG5cdFx0XHRjb25zdCB3b3JsZCA9IG5ldyBGbG9hdDMyQXJyYXkobm4pO1xuXG5cdFx0XHRjbGlwcGluZ0F0dGFjaG1lbnQuY29tcHV0ZVdvcmxkVmVydGljZXMoc2xvdCwgMCwgbm4sIHdvcmxkLCAwLCAyKTtcblx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMuY2xpcHBpbmdQb2x5Z29uLnBvbHkoQXJyYXkuZnJvbSh3b3JsZCkpO1xuXHRcdH1cblxuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMuY2xpcHBpbmdQb2x5Z29uLnN0cm9rZSh7XG5cdFx0XHR3aWR0aDogbGluZVdpZHRoLCBjb2xvcjogdGhpcy5jbGlwcGluZ1BvbHlnb25Db2xvciwgYWxwaGE6IDFcblx0XHR9KTtcblx0fVxuXG5cdGRyYXdCb3VuZGluZ0JveGVzRnVuYyAoc3BpbmU6IFNwaW5lLCBkZWJ1Z0Rpc3BsYXlPYmplY3RzOiBEZWJ1Z0Rpc3BsYXlPYmplY3RzLCBsaW5lV2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIGRyYXcgdGhlIHRvdGFsIG91dGxpbmUgb2YgdGhlIGJvdW5kaW5nIGJveFxuXHRcdGNvbnN0IGJvdW5kcyA9IG5ldyBTa2VsZXRvbkJvdW5kcygpO1xuXHRcdGJvdW5kcy51cGRhdGUoc3BpbmUuc2tlbGV0b24sIHRydWUpO1xuXG5cdFx0aWYgKGJvdW5kcy5taW5YICE9PSBJbmZpbml0eSkge1xuXHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5ib3VuZGluZ0JveGVzUmVjdFxuXHRcdFx0XHQucmVjdChib3VuZHMubWluWCwgYm91bmRzLm1pblksIGJvdW5kcy5nZXRXaWR0aCgpLCBib3VuZHMuZ2V0SGVpZ2h0KCkpXG5cdFx0XHRcdC5zdHJva2UoeyB3aWR0aDogbGluZVdpZHRoLCBjb2xvcjogdGhpcy5ib3VuZGluZ0JveGVzUmVjdENvbG9yIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvbHlnb25zID0gYm91bmRzLnBvbHlnb25zO1xuXHRcdGNvbnN0IGRyYXdQb2x5Z29uID0gKHBvbHlnb25WZXJ0aWNlczogQXJyYXlMaWtlPG51bWJlcj4sIF9vZmZzZXQ6IHVua25vd24sIGNvdW50OiBudW1iZXIpOiB2b2lkID0+IHtcblx0XHRcdGlmIChjb3VudCA8IDMpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQb2x5Z29uIG11c3QgY29udGFpbiBhdCBsZWFzdCAzIHZlcnRpY2VzJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXRoczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGRvdFNpemUgPSBsaW5lV2lkdGggKiAyO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcG9seWdvblZlcnRpY2VzLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAyKSB7XG5cdFx0XHRcdGNvbnN0IHgxID0gcG9seWdvblZlcnRpY2VzW2ldO1xuXHRcdFx0XHRjb25zdCB5MSA9IHBvbHlnb25WZXJ0aWNlc1tpICsgMV07XG5cblx0XHRcdFx0Ly8gZHJhdyB0aGUgYm91bmRpbmcgYm94IG5vZGVcblx0XHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5ib3VuZGluZ0JveGVzQ2lyY2xlLmJlZ2luRmlsbCh0aGlzLmJvdW5kaW5nQm94ZXNDaXJjbGVDb2xvcik7XG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMuYm91bmRpbmdCb3hlc0NpcmNsZS5kcmF3Q2lyY2xlKHgxLCB5MSwgZG90U2l6ZSk7XG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMuYm91bmRpbmdCb3hlc0NpcmNsZS5maWxsKDApO1xuXG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMuYm91bmRpbmdCb3hlc0NpcmNsZVxuXHRcdFx0XHRcdC5jaXJjbGUoeDEsIHkxLCBkb3RTaXplKVxuXHRcdFx0XHRcdC5maWxsKHsgY29sb3I6IHRoaXMuYm91bmRpbmdCb3hlc0NpcmNsZUNvbG9yIH0pXG5cblx0XHRcdFx0cGF0aHMucHVzaCh4MSwgeTEpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkcmF3IHRoZSBib3VuZGluZyBib3ggYXJlYVxuXHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5ib3VuZGluZ0JveGVzUG9seWdvblxuXHRcdFx0XHQucG9seShwYXRocylcblx0XHRcdFx0LmZpbGwoe1xuXHRcdFx0XHRcdGNvbG9yOiB0aGlzLmJvdW5kaW5nQm94ZXNQb2x5Z29uQ29sb3IsXG5cdFx0XHRcdFx0YWxwaGE6IDAuMVxuXHRcdFx0XHR9KVxuXHRcdFx0XHQuc3Ryb2tlKHtcblx0XHRcdFx0XHR3aWR0aDogbGluZVdpZHRoLFxuXHRcdFx0XHRcdGNvbG9yOiB0aGlzLmJvdW5kaW5nQm94ZXNQb2x5Z29uQ29sb3Jcblx0XHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBwb2x5Z29ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcG9seWdvbiA9IHBvbHlnb25zW2ldO1xuXG5cdFx0XHRkcmF3UG9seWdvbihwb2x5Z29uLCAwLCBwb2x5Z29uLmxlbmd0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkcmF3UGF0aHNGdW5jIChzcGluZTogU3BpbmUsIGRlYnVnRGlzcGxheU9iamVjdHM6IERlYnVnRGlzcGxheU9iamVjdHMsIGxpbmVXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2tlbGV0b24gPSBzcGluZS5za2VsZXRvbjtcblx0XHRjb25zdCBzbG90cyA9IHNrZWxldG9uLnNsb3RzO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNsb3RzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzbG90ID0gc2xvdHNbaV07XG5cblx0XHRcdGlmICghc2xvdC5ib25lLmFjdGl2ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBzbG90LmdldEF0dGFjaG1lbnQoKTtcblxuXHRcdFx0aWYgKGF0dGFjaG1lbnQgPT09IG51bGwgfHwgIShhdHRhY2htZW50IGluc3RhbmNlb2YgUGF0aEF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXRoQXR0YWNobWVudCA9IGF0dGFjaG1lbnQ7XG5cdFx0XHRsZXQgbm4gPSBwYXRoQXR0YWNobWVudC53b3JsZFZlcnRpY2VzTGVuZ3RoO1xuXHRcdFx0Y29uc3Qgd29ybGQgPSBuZXcgRmxvYXQzMkFycmF5KG5uKTtcblxuXHRcdFx0cGF0aEF0dGFjaG1lbnQuY29tcHV0ZVdvcmxkVmVydGljZXMoc2xvdCwgMCwgbm4sIHdvcmxkLCAwLCAyKTtcblx0XHRcdGxldCB4MSA9IHdvcmxkWzJdO1xuXHRcdFx0bGV0IHkxID0gd29ybGRbM107XG5cdFx0XHRsZXQgeDIgPSAwO1xuXHRcdFx0bGV0IHkyID0gMDtcblxuXHRcdFx0aWYgKHBhdGhBdHRhY2htZW50LmNsb3NlZCkge1xuXHRcdFx0XHRjb25zdCBjeDEgPSB3b3JsZFswXTtcblx0XHRcdFx0Y29uc3QgY3kxID0gd29ybGRbMV07XG5cdFx0XHRcdGNvbnN0IGN4MiA9IHdvcmxkW25uIC0gMl07XG5cdFx0XHRcdGNvbnN0IGN5MiA9IHdvcmxkW25uIC0gMV07XG5cblx0XHRcdFx0eDIgPSB3b3JsZFtubiAtIDRdO1xuXHRcdFx0XHR5MiA9IHdvcmxkW25uIC0gM107XG5cblx0XHRcdFx0Ly8gY3VydmVcblx0XHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0N1cnZlLm1vdmVUbyh4MSwgeTEpO1xuXHRcdFx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhdGhzQ3VydmUuYmV6aWVyQ3VydmVUbyhjeDEsIGN5MSwgY3gyLCBjeTIsIHgyLCB5Mik7XG5cblx0XHRcdFx0Ly8gaGFuZGxlXG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGF0aHNMaW5lLm1vdmVUbyh4MSwgeTEpO1xuXHRcdFx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhdGhzTGluZS5saW5lVG8oY3gxLCBjeTEpO1xuXHRcdFx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhdGhzTGluZS5tb3ZlVG8oeDIsIHkyKTtcblx0XHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0xpbmUubGluZVRvKGN4MiwgY3kyKTtcblx0XHRcdH1cblx0XHRcdG5uIC09IDQ7XG5cdFx0XHRmb3IgKGxldCBpaSA9IDQ7IGlpIDwgbm47IGlpICs9IDYpIHtcblx0XHRcdFx0Y29uc3QgY3gxID0gd29ybGRbaWldO1xuXHRcdFx0XHRjb25zdCBjeTEgPSB3b3JsZFtpaSArIDFdO1xuXHRcdFx0XHRjb25zdCBjeDIgPSB3b3JsZFtpaSArIDJdO1xuXHRcdFx0XHRjb25zdCBjeTIgPSB3b3JsZFtpaSArIDNdO1xuXG5cdFx0XHRcdHgyID0gd29ybGRbaWkgKyA0XTtcblx0XHRcdFx0eTIgPSB3b3JsZFtpaSArIDVdO1xuXHRcdFx0XHQvLyBjdXJ2ZVxuXHRcdFx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhdGhzQ3VydmUubW92ZVRvKHgxLCB5MSk7XG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGF0aHNDdXJ2ZS5iZXppZXJDdXJ2ZVRvKGN4MSwgY3kxLCBjeDIsIGN5MiwgeDIsIHkyKTtcblxuXHRcdFx0XHQvLyBoYW5kbGVcblx0XHRcdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0xpbmUubW92ZVRvKHgxLCB5MSk7XG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGF0aHNMaW5lLmxpbmVUbyhjeDEsIGN5MSk7XG5cdFx0XHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGF0aHNMaW5lLm1vdmVUbyh4MiwgeTIpO1xuXHRcdFx0XHRkZWJ1Z0Rpc3BsYXlPYmplY3RzLnBhdGhzTGluZS5saW5lVG8oY3gyLCBjeTIpO1xuXHRcdFx0XHR4MSA9IHgyO1xuXHRcdFx0XHR5MSA9IHkyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGRlYnVnRGlzcGxheU9iamVjdHMucGF0aHNDdXJ2ZS5zdHJva2UoeyB3aWR0aDogbGluZVdpZHRoLCBjb2xvcjogdGhpcy5wYXRoc0N1cnZlQ29sb3IgfSk7XG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXRoc0xpbmUuc3Ryb2tlKHsgd2lkdGg6IGxpbmVXaWR0aCwgY29sb3I6IHRoaXMucGF0aHNMaW5lQ29sb3IgfSk7XG5cdH1cblxuXHRwdWJsaWMgdW5yZWdpc3RlclNwaW5lIChzcGluZTogU3BpbmUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucmVnaXN0ZXJlZFNwaW5lcy5oYXMoc3BpbmUpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ1NwaW5lRGVidWdSZW5kZXJlci51bnJlZ2lzdGVyU3BpbmUoKSAtIHNwaW5lIGlzIG5vdCByZWdpc3RlcmVkLCBjYW5cXCd0IHVucmVnaXN0ZXIhJywgc3BpbmUpO1xuXHRcdH1cblx0XHRjb25zdCBkZWJ1Z0Rpc3BsYXlPYmplY3RzID0gdGhpcy5yZWdpc3RlcmVkU3BpbmVzLmdldChzcGluZSk7XG5cblx0XHRpZiAoIWRlYnVnRGlzcGxheU9iamVjdHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzcGluZS5zdGF0ZS5yZW1vdmVMaXN0ZW5lcihkZWJ1Z0Rpc3BsYXlPYmplY3RzLmV2ZW50Q2FsbGJhY2spO1xuXG5cdFx0ZGVidWdEaXNwbGF5T2JqZWN0cy5wYXJlbnREZWJ1Z0NvbnRhaW5lci5kZXN0cm95KHsgdGV4dHVyZVNvdXJjZTogdHJ1ZSwgY2hpbGRyZW46IHRydWUsIHRleHR1cmU6IHRydWUgfSk7XG5cdFx0dGhpcy5yZWdpc3RlcmVkU3BpbmVzLmRlbGV0ZShzcGluZSk7XG5cdH1cbn1cbiJdfQ==