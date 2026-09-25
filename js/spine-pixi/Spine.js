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
import { Assets, Cache, Container, DEG_TO_RAD, fastCopy, Graphics, Texture, Ticker, ViewContainer, } from 'pixi.js';
import { AnimationState, AnimationStateData, AtlasAttachmentLoader, ClippingAttachment, Color, MeshAttachment, Physics, Pool, RegionAttachment, Skeleton, SkeletonBinary, SkeletonBounds, SkeletonClipping, SkeletonData, SkeletonJson, Vector2, } from '@esotericsoftware/spine-core';
;
const vectorAux = new Vector2();
Skeleton.yDown = true;
const clipper = new SkeletonClipping();
;
const maskPool = new Pool(() => new Graphics);
/**
 * The class to instantiate a {@link Spine} game object in Pixi.
 * The static method {@link Spine.from} should be used to instantiate a Spine game object.
 */
export class Spine extends ViewContainer {
    // Pixi properties
    batched = true;
    buildId = 0;
    renderPipeId = 'spine';
    _didSpineUpdate = false;
    beforeUpdateWorldTransforms = () => { };
    afterUpdateWorldTransforms = () => { };
    // Spine properties
    /** The skeleton for this Spine game object. */
    skeleton;
    /** The animation state for this Spine game object. */
    state;
    skeletonBounds;
    darkTint = false;
    _debug = undefined;
    _slotsObject = Object.create(null);
    clippingSlotToPixiMasks = Object.create(null);
    getSlotFromRef(slotRef) {
        let slot;
        if (typeof slotRef === 'number')
            slot = this.skeleton.slots[slotRef];
        else if (typeof slotRef === 'string')
            slot = this.skeleton.findSlot(slotRef);
        else
            slot = slotRef;
        if (!slot)
            throw new Error(`No slot found with the given slot reference: ${slotRef}`);
        return slot;
    }
    spineAttachmentsDirty = true;
    spineTexturesDirty = true;
    _lastAttachments = [];
    _stateChanged = true;
    attachmentCacheData = [];
    get debug() {
        return this._debug;
    }
    /** Pass a {@link SpineDebugRenderer} or create your own {@link ISpineDebugRenderer} to render bones, meshes, ...
     * @example spineGO.debug = new SpineDebugRenderer();
     */
    set debug(value) {
        if (this._debug) {
            this._debug.unregisterSpine(this);
        }
        if (value) {
            value.registerSpine(this);
        }
        this._debug = value;
    }
    _autoUpdate = true;
    get autoUpdate() {
        return this._autoUpdate;
    }
    /** When `true`, the Spine AnimationState and the Skeleton will be automatically updated using the {@link Ticker.shared} instance. */
    set autoUpdate(value) {
        if (value) {
            Ticker.shared.add(this.internalUpdate, this);
        }
        else {
            Ticker.shared.remove(this.internalUpdate, this);
        }
        this._autoUpdate = value;
    }
    hasNeverUpdated = true;
    constructor(options) {
        if (options instanceof SkeletonData) {
            options = {
                skeletonData: options,
            };
        }
        // Vendored patch: Pixi 8.19's ViewContainer constructor requires an
        // options object (reads options.autoGarbageCollect unconditionally);
        // spine-pixi 4.2.65 targets pixi ^8.4 where super() was sufficient.
        super({});
        const skeletonData = options instanceof SkeletonData ? options : options.skeletonData;
        this.skeleton = new Skeleton(skeletonData);
        this.state = new AnimationState(new AnimationStateData(skeletonData));
        this.autoUpdate = options?.autoUpdate ?? true;
        // dark tint can be enabled by options, otherwise is enable if at least one slot has tint black
        this.darkTint = options?.darkTint === undefined
            ? this.skeleton.slots.some(slot => !!slot.data.darkColor)
            : options?.darkTint;
        const slots = this.skeleton.slots;
        for (let i = 0; i < slots.length; i++) {
            this.attachmentCacheData[i] = Object.create(null);
        }
    }
    /** If {@link Spine.autoUpdate} is `false`, this method allows to update the AnimationState and the Skeleton with the given delta. */
    update(dt) {
        this.internalUpdate(0, dt);
    }
    internalUpdate(_deltaFrame, deltaSeconds) {
        // Because reasons, pixi uses deltaFrames at 60fps.
        // We ignore the default deltaFrames and use the deltaSeconds from pixi ticker.
        this._updateAndApplyState(deltaSeconds ?? Ticker.shared.deltaMS / 1000);
    }
    get bounds() {
        if (this._boundsDirty) {
            this.updateBounds();
        }
        return this._bounds;
    }
    /**
     * Set the position of the bone given in input through a {@link IPointData}.
     * @param bone: the bone name or the bone instance to set the position
     * @param outPos: the new position of the bone.
     * @throws {Error}: if the given bone is not found in the skeleton, an error is thrown
     */
    setBonePosition(bone, position) {
        const boneAux = bone;
        if (typeof bone === 'string') {
            bone = this.skeleton.findBone(bone);
        }
        if (!bone)
            throw Error(`Cant set bone position, bone ${String(boneAux)} not found`);
        vectorAux.set(position.x, position.y);
        if (bone.parent) {
            const aux = bone.parent.worldToLocal(vectorAux);
            bone.x = aux.x;
            bone.y = -aux.y;
        }
        else {
            bone.x = vectorAux.x;
            bone.y = vectorAux.y;
        }
    }
    /**
     * Return the position of the bone given in input into an {@link IPointData}.
     * @param bone: the bone name or the bone instance to get the position from
     * @param outPos: an optional {@link IPointData} to use to return the bone position, rathern than instantiating a new object.
     * @returns {IPointData | undefined}: the position of the bone, or undefined if no matching bone is found in the skeleton
     */
    getBonePosition(bone, outPos) {
        const boneAux = bone;
        if (typeof bone === 'string') {
            bone = this.skeleton.findBone(bone);
        }
        if (!bone) {
            console.error(`Cant set bone position! Bone ${String(boneAux)} not found`);
            return outPos;
        }
        if (!outPos) {
            outPos = { x: 0, y: 0 };
        }
        outPos.x = bone.worldX;
        outPos.y = bone.worldY;
        return outPos;
    }
    /**
     * Advance the state and skeleton by the given time, then update slot objects too.
     * The container transform is not updated.
     *
     * @param time the time at which to set the state
     */
    _updateAndApplyState(time) {
        this.hasNeverUpdated = false;
        this.state.update(time);
        this.skeleton.update(time);
        const { skeleton } = this;
        this.state.apply(skeleton);
        this.beforeUpdateWorldTransforms(this);
        skeleton.updateWorldTransform(Physics.update);
        this.afterUpdateWorldTransforms(this);
        this.updateSlotObjects();
        this._stateChanged = true;
        this._boundsDirty = true;
        this.onViewUpdate();
    }
    /**
     * - validates the attachments - to flag if the attachments have changed this state
     * - transforms the attachments - to update the vertices of the attachments based on the new positions
     * @internal
     */
    _validateAndTransformAttachments() {
        if (!this._stateChanged)
            return;
        this._stateChanged = false;
        this.validateAttachments();
        this.transformAttachments();
    }
    validateAttachments() {
        const currentDrawOrder = this.skeleton.drawOrder;
        const lastAttachments = this._lastAttachments;
        let index = 0;
        let spineAttachmentsDirty = false;
        for (let i = 0; i < currentDrawOrder.length; i++) {
            const slot = currentDrawOrder[i];
            const attachment = slot.getAttachment();
            if (attachment) {
                if (attachment !== lastAttachments[index]) {
                    spineAttachmentsDirty = true;
                    lastAttachments[index] = attachment;
                }
                index++;
            }
        }
        if (index !== lastAttachments.length) {
            spineAttachmentsDirty = true;
            lastAttachments.length = index;
        }
        this.spineAttachmentsDirty = spineAttachmentsDirty;
    }
    updateAndSetPixiMask(slot, last) {
        // assign/create the currentClippingSlot
        const attachment = slot.attachment;
        if (attachment && attachment instanceof ClippingAttachment) {
            const clip = (this.clippingSlotToPixiMasks[slot.data.name] ||= { slot, vertices: new Array() });
            clip.maskComputed = false;
            this.currentClippingSlot = this.clippingSlotToPixiMasks[slot.data.name];
            return;
        }
        // assign the currentClippingSlot mask to the slot object
        let currentClippingSlot = this.currentClippingSlot;
        let slotObject = this._slotsObject[slot.data.name];
        if (currentClippingSlot && slotObject) {
            let slotClipping = currentClippingSlot.slot;
            let clippingAttachment = slotClipping.attachment;
            // create the pixi mask, only the first time and if the clipped slot is the first one clipped by this currentClippingSlot
            let mask = currentClippingSlot.mask;
            if (!mask) {
                mask = maskPool.obtain();
                currentClippingSlot.mask = mask;
                this.addChild(mask);
            }
            // compute the pixi mask polygon, if the clipped slot is the first one clipped by this currentClippingSlot
            if (!currentClippingSlot.maskComputed) {
                currentClippingSlot.maskComputed = true;
                const worldVerticesLength = clippingAttachment.worldVerticesLength;
                const vertices = currentClippingSlot.vertices;
                clippingAttachment.computeWorldVertices(slotClipping, 0, worldVerticesLength, vertices, 0, 2);
                mask.clear().poly(vertices).stroke({ width: 0 }).fill({ alpha: .25 });
            }
            slotObject.container.mask = mask;
        }
        else if (slotObject?.container.mask) {
            // remove the mask, if slot object has a mask, but currentClippingSlot is undefined
            slotObject.container.mask = null;
        }
        // if current slot is the ending one of the currentClippingSlot mask, set currentClippingSlot to undefined
        if (currentClippingSlot && currentClippingSlot.slot.attachment.endSlot == slot.data) {
            this.currentClippingSlot = undefined;
        }
        // clean up unused masks
        if (last) {
            for (const key in this.clippingSlotToPixiMasks) {
                const clippingSlotToPixiMask = this.clippingSlotToPixiMasks[key];
                if ((!(clippingSlotToPixiMask.slot.attachment instanceof ClippingAttachment) || !clippingSlotToPixiMask.maskComputed) && clippingSlotToPixiMask.mask) {
                    this.removeChild(clippingSlotToPixiMask.mask);
                    maskPool.free(clippingSlotToPixiMask.mask);
                    clippingSlotToPixiMask.mask = undefined;
                }
            }
        }
    }
    currentClippingSlot;
    transformAttachments() {
        const currentDrawOrder = this.skeleton.drawOrder;
        for (let i = 0; i < currentDrawOrder.length; i++) {
            const slot = currentDrawOrder[i];
            this.updateAndSetPixiMask(slot, i === currentDrawOrder.length - 1);
            const attachment = slot.getAttachment();
            if (attachment) {
                if (attachment instanceof MeshAttachment || attachment instanceof RegionAttachment) {
                    const cacheData = this._getCachedData(slot, attachment);
                    if (attachment instanceof RegionAttachment) {
                        attachment.computeWorldVertices(slot, cacheData.vertices, 0, 2);
                    }
                    else {
                        attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, cacheData.vertices, 0, 2);
                    }
                    // sequences uvs are known only after computeWorldVertices is invoked
                    if (cacheData.uvs.length < attachment.uvs.length) {
                        cacheData.uvs = new Float32Array(attachment.uvs.length);
                    }
                    // need to copy because attachments uvs are shared among skeletons using the same atlas
                    fastCopy(attachment.uvs.buffer, cacheData.uvs.buffer);
                    const skeleton = slot.bone.skeleton;
                    const skeletonColor = skeleton.color;
                    const slotColor = slot.color;
                    const attachmentColor = attachment.color;
                    cacheData.color.set(skeletonColor.r * slotColor.r * attachmentColor.r, skeletonColor.g * slotColor.g * attachmentColor.g, skeletonColor.b * slotColor.b * attachmentColor.b, skeletonColor.a * slotColor.a * attachmentColor.a);
                    if (slot.darkColor) {
                        cacheData.darkColor.setFromColor(slot.darkColor);
                    }
                    cacheData.skipRender = cacheData.clipped = false;
                    const texture = attachment.region?.texture.texture || Texture.EMPTY;
                    if (cacheData.texture !== texture) {
                        cacheData.texture = texture;
                        this.spineTexturesDirty = true;
                    }
                    if (clipper.isClipping()) {
                        this.updateClippingData(cacheData);
                    }
                }
                else if (attachment instanceof ClippingAttachment) {
                    clipper.clipStart(slot, attachment);
                    continue;
                }
            }
            clipper.clipEndWithSlot(slot);
        }
        clipper.clipEnd();
    }
    updateClippingData(cacheData) {
        cacheData.clipped = true;
        clipper.clipTrianglesUnpacked(cacheData.vertices, cacheData.indices, cacheData.indices.length, cacheData.uvs);
        const { clippedVertices, clippedUVs, clippedTriangles } = clipper;
        const verticesCount = clippedVertices.length / 2;
        const indicesCount = clippedTriangles.length;
        if (!cacheData.clippedData) {
            cacheData.clippedData = {
                vertices: new Float32Array(verticesCount * 2),
                uvs: new Float32Array(verticesCount * 2),
                vertexCount: verticesCount,
                indices: new Uint16Array(indicesCount),
                indicesCount,
            };
            this.spineAttachmentsDirty = true;
        }
        const clippedData = cacheData.clippedData;
        const sizeChange = clippedData.vertexCount !== verticesCount || indicesCount !== clippedData.indicesCount;
        cacheData.skipRender = verticesCount === 0;
        if (sizeChange) {
            this.spineAttachmentsDirty = true;
            if (clippedData.vertexCount < verticesCount) {
                // buffer reuse!
                clippedData.vertices = new Float32Array(verticesCount * 2);
                clippedData.uvs = new Float32Array(verticesCount * 2);
            }
            if (clippedData.indices.length < indicesCount) {
                clippedData.indices = new Uint16Array(indicesCount);
            }
        }
        const { vertices, uvs, indices } = clippedData;
        for (let i = 0; i < verticesCount; i++) {
            vertices[i * 2] = clippedVertices[i * 2];
            vertices[(i * 2) + 1] = clippedVertices[(i * 2) + 1];
            uvs[i * 2] = clippedUVs[(i * 2)];
            uvs[(i * 2) + 1] = clippedUVs[(i * 2) + 1];
        }
        clippedData.vertexCount = verticesCount;
        for (let i = 0; i < indicesCount; i++) {
            if (indices[i] !== clippedTriangles[i]) {
                this.spineAttachmentsDirty = true;
                indices[i] = clippedTriangles[i];
            }
        }
        clippedData.indicesCount = indicesCount;
    }
    /**
     * ensure that attached containers map correctly to their slots
     * along with their position, rotation, scale, and visibility.
     */
    updateSlotObjects() {
        for (const i in this._slotsObject) {
            const slotAttachment = this._slotsObject[i];
            if (!slotAttachment)
                continue;
            this.updateSlotObject(slotAttachment);
        }
    }
    updateSlotObject(slotAttachment) {
        const { slot, container } = slotAttachment;
        container.visible = this.skeleton.drawOrder.includes(slot);
        if (container.visible) {
            const bone = slot.bone;
            container.position.set(bone.worldX, bone.worldY);
            container.scale.x = bone.getWorldScaleX();
            container.scale.y = bone.getWorldScaleY();
            container.rotation = bone.getWorldRotationX() * DEG_TO_RAD;
            container.alpha = this.skeleton.color.a * slot.color.a;
        }
    }
    /** @internal */
    _getCachedData(slot, attachment) {
        return this.attachmentCacheData[slot.data.index][attachment.name] || this.initCachedData(slot, attachment);
    }
    initCachedData(slot, attachment) {
        let vertices;
        if (attachment instanceof RegionAttachment) {
            vertices = new Float32Array(8);
            this.attachmentCacheData[slot.data.index][attachment.name] = {
                id: `${slot.data.index}-${attachment.name}`,
                vertices,
                clipped: false,
                indices: [0, 1, 2, 0, 2, 3],
                uvs: new Float32Array(attachment.uvs.length),
                color: new Color(1, 1, 1, 1),
                darkColor: new Color(0, 0, 0, 0),
                darkTint: this.darkTint,
                skipRender: false,
                texture: attachment.region?.texture.texture,
            };
        }
        else {
            vertices = new Float32Array(attachment.worldVerticesLength);
            this.attachmentCacheData[slot.data.index][attachment.name] = {
                id: `${slot.data.index}-${attachment.name}`,
                vertices,
                clipped: false,
                indices: attachment.triangles,
                uvs: new Float32Array(attachment.uvs.length),
                color: new Color(1, 1, 1, 1),
                darkColor: new Color(0, 0, 0, 0),
                darkTint: this.darkTint,
                skipRender: false,
                texture: attachment.region?.texture.texture,
            };
        }
        return this.attachmentCacheData[slot.data.index][attachment.name];
    }
    onViewUpdate() {
        // increment from the 12th bit!
        this._didChangeId += 1 << 12;
        this._boundsDirty = true;
        if (this.didViewUpdate)
            return;
        this.didViewUpdate = true;
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (renderGroup) {
            renderGroup.onChildViewUpdate(this);
        }
        this.debug?.renderDebug(this);
    }
    /**
     * Attaches a PixiJS container to a specified slot. This will map the world transform of the slots bone
     * to the attached container. A container can only be attached to one slot at a time.
     *
     * @param container - The container to attach to the slot
     * @param slotRef - The slot id or  slot to attach to
     */
    addSlotObject(slot, container) {
        slot = this.getSlotFromRef(slot);
        // need to check in on the container too...
        for (const i in this._slotsObject) {
            if (this._slotsObject[i]?.container === container) {
                this.removeSlotObject(this._slotsObject[i].slot);
            }
        }
        this.removeSlotObject(slot);
        container.includeInBuild = false;
        // TODO only add once??
        this.addChild(container);
        const slotObject = { container, slot };
        this._slotsObject[slot.data.name] = slotObject;
        this.updateSlotObject(slotObject);
    }
    /**
     * Removes a PixiJS container from the slot it is attached to.
     *
     * @param container - The container to detach from the slot
     * @param slotOrContainer - The container, slot id or slot to detach from
     */
    removeSlotObject(slotOrContainer) {
        let containerToRemove;
        if (slotOrContainer instanceof Container) {
            for (const i in this._slotsObject) {
                if (this._slotsObject[i]?.container === slotOrContainer) {
                    this._slotsObject[i] = null;
                    containerToRemove = slotOrContainer;
                    break;
                }
            }
        }
        else {
            const slot = this.getSlotFromRef(slotOrContainer);
            containerToRemove = this._slotsObject[slot.data.name]?.container;
            this._slotsObject[slot.data.name] = null;
        }
        if (containerToRemove) {
            this.removeChild(containerToRemove);
            containerToRemove.includeInBuild = true;
        }
    }
    /**
     * Returns a container attached to a slot, or undefined if no container is attached.
     *
     * @param slotRef - The slot id or slot to get the attachment from
     * @returns - The container attached to the slot
     */
    getSlotObject(slot) {
        slot = this.getSlotFromRef(slot);
        return this._slotsObject[slot.data.name]?.container;
    }
    updateBounds() {
        this._boundsDirty = false;
        this.skeletonBounds ||= new SkeletonBounds();
        const skeletonBounds = this.skeletonBounds;
        skeletonBounds.update(this.skeleton, true);
        if (skeletonBounds.minX === Infinity) {
            if (this.hasNeverUpdated) {
                this._updateAndApplyState(0);
                this._boundsDirty = false;
            }
            this._validateAndTransformAttachments();
            const drawOrder = this.skeleton.drawOrder;
            const bounds = this._bounds;
            bounds.clear();
            for (let i = 0; i < drawOrder.length; i++) {
                const slot = drawOrder[i];
                const attachment = slot.getAttachment();
                if (attachment && (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment)) {
                    const cacheData = this._getCachedData(slot, attachment);
                    bounds.addVertexData(cacheData.vertices, 0, cacheData.vertices.length);
                }
            }
        }
        else {
            this._bounds.minX = skeletonBounds.minX;
            this._bounds.minY = skeletonBounds.minY;
            this._bounds.maxX = skeletonBounds.maxX;
            this._bounds.maxY = skeletonBounds.maxY;
        }
    }
    /** @internal */
    addBounds(bounds) {
        bounds.addBounds(this.bounds);
    }
    /**
     * Destroys this sprite renderable and optionally its texture.
     * @param options - Options parameter. A boolean will act as if all options
     *  have been set to that value
     * @param {boolean} [options.texture=false] - Should it destroy the current texture of the renderable as well
     * @param {boolean} [options.textureSource=false] - Should it destroy the textureSource of the renderable as well
     */
    destroy(options = false) {
        super.destroy(options);
        Ticker.shared.remove(this.internalUpdate, this);
        this.state.clearListeners();
        this.debug = undefined;
        this.skeleton = null;
        this.state = null;
        this._slotsObject = null;
        this._lastAttachments.length = 0;
        this.attachmentCacheData = null;
    }
    /** Converts a point from the skeleton coordinate system to the Pixi world coordinate system. */
    skeletonToPixiWorldCoordinates(point) {
        this.worldTransform.apply(point, point);
    }
    /** Converts a point from the Pixi world coordinate system to the skeleton coordinate system. */
    pixiWorldCoordinatesToSkeleton(point) {
        this.worldTransform.applyInverse(point, point);
    }
    /** Converts a point from the Pixi world coordinate system to the bone's local coordinate system. */
    pixiWorldCoordinatesToBone(point, bone) {
        this.pixiWorldCoordinatesToSkeleton(point);
        if (bone.parent) {
            bone.parent.worldToLocal(point);
        }
        else {
            bone.worldToLocal(point);
        }
    }
    /**
     * Use this method to instantiate a Spine game object.
     * Before instantiating a Spine game object, the skeleton (`.skel` or `.json`) and the atlas text files must be loaded into the Assets. For example:
     * ```
     * PIXI.Assets.add("sackData", "./assets/sack-pro.skel");
     * PIXI.Assets.add("sackAtlas", "./assets/sack-pma.atlas");
     * await PIXI.Assets.load(["sackData", "sackAtlas"]);
     * ```
     * Once a Spine game object is created, its skeleton data is cached into {@link Cache} using the key:
     * `${skeletonAssetName}-${atlasAssetName}-${options?.scale ?? 1}`
     *
     * @param options - Options to configure the Spine game object. See {@link SpineFromOptions}
     * @returns {Spine} The Spine game object instantiated
     */
    static from({ skeleton, atlas, scale = 1, darkTint, autoUpdate = true }) {
        const cacheKey = `${skeleton}-${atlas}-${scale}`;
        if (Cache.has(cacheKey)) {
            return new Spine(Cache.get(cacheKey));
        }
        const skeletonAsset = Assets.get(skeleton);
        const atlasAsset = Assets.get(atlas);
        const attachmentLoader = new AtlasAttachmentLoader(atlasAsset);
        const parser = skeletonAsset instanceof Uint8Array
            ? new SkeletonBinary(attachmentLoader)
            : new SkeletonJson(attachmentLoader);
        parser.scale = scale;
        const skeletonData = parser.readSkeletonData(skeletonAsset);
        Cache.set(cacheKey, skeletonData);
        return new Spine({
            skeletonData,
            darkTint,
            autoUpdate,
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3BpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvU3BpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsrRUEyQitFO0FBRS9FLE9BQU8sRUFDTixNQUFNLEVBRU4sS0FBSyxFQUNMLFNBQVMsRUFFVCxVQUFVLEVBRVYsUUFBUSxFQUNSLFFBQVEsRUFFUixPQUFPLEVBQ1AsTUFBTSxFQUNOLGFBQWEsR0FDYixNQUFNLFNBQVMsQ0FBQztBQUVqQixPQUFPLEVBQ04sY0FBYyxFQUNkLGtCQUFrQixFQUNsQixxQkFBcUIsRUFHckIsa0JBQWtCLEVBQ2xCLEtBQUssRUFDTCxjQUFjLEVBQ2QsT0FBTyxFQUNQLElBQUksRUFDSixnQkFBZ0IsRUFDaEIsUUFBUSxFQUNSLGNBQWMsRUFDZCxjQUFjLEVBQ2QsZ0JBQWdCLEVBQ2hCLFlBQVksRUFDWixZQUFZLEVBSVosT0FBTyxHQUNQLE1BQU0sOEJBQThCLENBQUM7QUF3QnJDLENBQUM7QUFFRixNQUFNLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO0FBRWhDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO0FBRXRCLE1BQU0sT0FBTyxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztBQWtEdEMsQ0FBQztBQUVGLE1BQU0sUUFBUSxHQUFHLElBQUksSUFBSSxDQUFXLEdBQUcsRUFBRSxDQUFDLElBQUksUUFBUSxDQUFDLENBQUM7QUFFeEQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLEtBQU0sU0FBUSxhQUFhO0lBQ3ZDLGtCQUFrQjtJQUNYLE9BQU8sR0FBRyxJQUFJLENBQUM7SUFDZixPQUFPLEdBQUcsQ0FBQyxDQUFDO0lBQ00sWUFBWSxHQUFHLE9BQU8sQ0FBQztJQUN6QyxlQUFlLEdBQUcsS0FBSyxDQUFDO0lBRXhCLDJCQUEyQixHQUE0QixHQUFHLEVBQUUsR0FBVSxDQUFDLENBQUM7SUFDeEUsMEJBQTBCLEdBQTRC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LENBQUMsQ0FBQztRQUNuRCxNQUFNLGdCQUFnQixHQUFHLElBQUkscUJBQXFCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDL0QsTUFBTSxNQUFNLEdBQUcsYUFBYSxZQUFZLFVBQVU7WUFDakQsQ0FBQyxDQUFDLElBQUksY0FBYyxDQUFDLGdCQUFnQixDQUFDO1lBQ3RDLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRXRDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUU1RCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUVsQyxPQUFPLElBQUksS0FBSyxDQUFDO1lBQ2hCLFlBQVk7WUFDWixRQUFRO1lBQ1IsVUFBVTtTQUNWLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbIi8qKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBTcGluZSBSdW50aW1lcyBMaWNlbnNlIEFncmVlbWVudFxuICogTGFzdCB1cGRhdGVkIEp1bHkgMjgsIDIwMjMuIFJlcGxhY2VzIGFsbCBwcmlvciB2ZXJzaW9ucy5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMywgRXNvdGVyaWMgU29mdHdhcmUgTExDXG4gKlxuICogSW50ZWdyYXRpb24gb2YgdGhlIFNwaW5lIFJ1bnRpbWVzIGludG8gc29mdHdhcmUgb3Igb3RoZXJ3aXNlIGNyZWF0aW5nXG4gKiBkZXJpdmF0aXZlIHdvcmtzIG9mIHRoZSBTcGluZSBSdW50aW1lcyBpcyBwZXJtaXR0ZWQgdW5kZXIgdGhlIHRlcm1zIGFuZFxuICogY29uZGl0aW9ucyBvZiBTZWN0aW9uIDIgb2YgdGhlIFNwaW5lIEVkaXRvciBMaWNlbnNlIEFncmVlbWVudDpcbiAqIGh0dHA6Ly9lc290ZXJpY3NvZnR3YXJlLmNvbS9zcGluZS1lZGl0b3ItbGljZW5zZVxuICpcbiAqIE90aGVyd2lzZSwgaXQgaXMgcGVybWl0dGVkIHRvIGludGVncmF0ZSB0aGUgU3BpbmUgUnVudGltZXMgaW50byBzb2Z0d2FyZSBvclxuICogb3RoZXJ3aXNlIGNyZWF0ZSBkZXJpdmF0aXZlIHdvcmtzIG9mIHRoZSBTcGluZSBSdW50aW1lcyAoY29sbGVjdGl2ZWx5LFxuICogXCJQcm9kdWN0c1wiKSwgcHJvdmlkZWQgdGhhdCBlYWNoIHVzZXIgb2YgdGhlIFByb2R1Y3RzIG11c3Qgb2J0YWluIHRoZWlyIG93blxuICogU3BpbmUgRWRpdG9yIGxpY2Vuc2UgYW5kIHJlZGlzdHJpYnV0aW9uIG9mIHRoZSBQcm9kdWN0cyBpbiBhbnkgZm9ybSBtdXN0XG4gKiBpbmNsdWRlIHRoaXMgbGljZW5zZSBhbmQgY29weXJpZ2h0IG5vdGljZS5cbiAqXG4gKiBUSEUgU1BJTkUgUlVOVElNRVMgQVJFIFBST1ZJREVEIEJZIEVTT1RFUklDIFNPRlRXQVJFIExMQyBcIkFTIElTXCIgQU5EIEFOWVxuICogRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgRVNPVEVSSUMgU09GVFdBUkUgTExDIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTLFxuICogQlVTSU5FU1MgSU5URVJSVVBUSU9OLCBPUiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUykgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRIRVxuICogU1BJTkUgUlVOVElNRVMsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbmltcG9ydCB7XG5cdEFzc2V0cyxcblx0Qm91bmRzLFxuXHRDYWNoZSxcblx0Q29udGFpbmVyLFxuXHRDb250YWluZXJPcHRpb25zLFxuXHRERUdfVE9fUkFELFxuXHREZXN0cm95T3B0aW9ucyxcblx0ZmFzdENvcHksXG5cdEdyYXBoaWNzLFxuXHRQb2ludERhdGEsXG5cdFRleHR1cmUsXG5cdFRpY2tlcixcblx0Vmlld0NvbnRhaW5lcixcbn0gZnJvbSAncGl4aS5qcyc7XG5pbXBvcnQgeyBJU3BpbmVEZWJ1Z1JlbmRlcmVyIH0gZnJvbSAnLi9TcGluZURlYnVnUmVuZGVyZXInO1xuaW1wb3J0IHtcblx0QW5pbWF0aW9uU3RhdGUsXG5cdEFuaW1hdGlvblN0YXRlRGF0YSxcblx0QXRsYXNBdHRhY2htZW50TG9hZGVyLFxuXHRBdHRhY2htZW50LFxuXHRCb25lLFxuXHRDbGlwcGluZ0F0dGFjaG1lbnQsXG5cdENvbG9yLFxuXHRNZXNoQXR0YWNobWVudCxcblx0UGh5c2ljcyxcblx0UG9vbCxcblx0UmVnaW9uQXR0YWNobWVudCxcblx0U2tlbGV0b24sXG5cdFNrZWxldG9uQmluYXJ5LFxuXHRTa2VsZXRvbkJvdW5kcyxcblx0U2tlbGV0b25DbGlwcGluZyxcblx0U2tlbGV0b25EYXRhLFxuXHRTa2VsZXRvbkpzb24sXG5cdFNsb3QsXG5cdHR5cGUgVGV4dHVyZUF0bGFzLFxuXHRUcmFja0VudHJ5LFxuXHRWZWN0b3IyLFxufSBmcm9tICdAZXNvdGVyaWNzb2Z0d2FyZS9zcGluZS1jb3JlJztcblxuLyoqXG4gKiBPcHRpb25zIHRvIGNyZWF0ZSBhIHtAbGluayBTcGluZX0gdXNpbmcge0BsaW5rIFNwaW5lLmZyb219LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNwaW5lRnJvbU9wdGlvbnMge1xuXHQvKiogdGhlIGFzc2V0IG5hbWUgZm9yIHRoZSBza2VsZXRvbiBgLnNrZWxgIG9yIGAuanNvbmAgZmlsZSBwcmV2aW91c2x5IGxvYWRlZCBpbnRvIHRoZSBBc3NldHMgKi9cblx0c2tlbGV0b246IHN0cmluZztcblxuXHQvKiogdGhlIGFzc2V0IG5hbWUgZm9yIHRoZSBhdGxhcyBmaWxlIHByZXZpb3VzbHkgbG9hZGVkIGludG8gdGhlIEFzc2V0cyAqL1xuXHRhdGxhczogc3RyaW5nO1xuXG5cdC8qKiAgVGhlIHZhbHVlIHBhc3NlZCB0byB0aGUgc2tlbGV0b24gcmVhZGVyLiBJZiBvbWl0dGVkLCAxIGlzIHBhc3NlZC4gU2VlIHtAbGluayBTa2VsZXRvbkJpbmFyeS5zY2FsZX0gZm9yIGRldGFpbHMuICovXG5cdHNjYWxlPzogbnVtYmVyO1xuXG5cdC8qKiAgU2V0IHRoZSB7QGxpbmsgU3BpbmUuYXV0b1VwZGF0ZX0gdmFsdWUuIElmIG9taXR0ZWQsIGl0IGlzIHNldCB0byBgdHJ1ZWAuICovXG5cdGF1dG9VcGRhdGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBgdHJ1ZWAsIHVzZSB0aGUgZGFyayB0aW50IHJlbmRlcmVyIHRvIHJlbmRlciB0aGUgc2tlbGV0b25cblx0ICogSWYgYGZhbHNlYCwgdXNlIHRoZSBkZWZhdWx0IHBpeGkgcmVuZGVyZXIgdG8gcmVuZGVyIHRoZSBza2VsZXRvblxuXHQgKiBJZiBgdW5kZWZpbmVkYCwgdXNlIHRoZSBkYXJrIHRpbnQgcmVuZGVyZXIgaWYgYXQgbGVhc3Qgb25lIHNsb3QgaGFzIHRpbnQgYmxhY2tcblx0ICovXG5cdGRhcmtUaW50PzogYm9vbGVhbjtcbn07XG5cbmNvbnN0IHZlY3RvckF1eCA9IG5ldyBWZWN0b3IyKCk7XG5cblNrZWxldG9uLnlEb3duID0gdHJ1ZTtcblxuY29uc3QgY2xpcHBlciA9IG5ldyBTa2VsZXRvbkNsaXBwaW5nKCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3BpbmVPcHRpb25zIGV4dGVuZHMgQ29udGFpbmVyT3B0aW9ucyB7XG5cdC8qKiB0aGUge0BsaW5rIFNrZWxldG9uRGF0YX0gdXNlZCB0byBpbnN0YW50aWF0ZSB0aGUgc2tlbGV0b24gKi9cblx0c2tlbGV0b25EYXRhOiBTa2VsZXRvbkRhdGE7XG5cblx0LyoqICBTZWUge0BsaW5rIFNwaW5lRnJvbU9wdGlvbnMuYXV0b1VwZGF0ZX0uICovXG5cdGF1dG9VcGRhdGU/OiBib29sZWFuO1xuXG5cdC8qKiAgU2VlIHtAbGluayBTcGluZUZyb21PcHRpb25zLmRhcmtUaW50fS4gKi9cblx0ZGFya1RpbnQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEFuaW1hdGlvblN0YXRlTGlzdGVuZXIge0BsaW5rIGh0dHBzOi8vZW4uZXNvdGVyaWNzb2Z0d2FyZS5jb20vc3BpbmUtYXBpLXJlZmVyZW5jZSNBbmltYXRpb25TdGF0ZUxpc3RlbmVyIGV2ZW50c30gZXhwb3NlZCBmb3IgUGl4aS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTcGluZUV2ZW50cyB7XG5cdGNvbXBsZXRlOiBbdHJhY2tFbnRyeTogVHJhY2tFbnRyeV07XG5cdGRpc3Bvc2U6IFt0cmFja0VudHJ5OiBUcmFja0VudHJ5XTtcblx0ZW5kOiBbdHJhY2tFbnRyeTogVHJhY2tFbnRyeV07XG5cdGV2ZW50OiBbdHJhY2tFbnRyeTogVHJhY2tFbnRyeSwgZXZlbnQ6IEV2ZW50XTtcblx0aW50ZXJydXB0OiBbdHJhY2tFbnRyeTogVHJhY2tFbnRyeV07XG5cdHN0YXJ0OiBbdHJhY2tFbnRyeTogVHJhY2tFbnRyeV07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXR0YWNobWVudENhY2hlRGF0YSB7XG5cdGlkOiBzdHJpbmc7XG5cdGNsaXBwZWQ6IGJvb2xlYW47XG5cdHZlcnRpY2VzOiBGbG9hdDMyQXJyYXk7XG5cdHV2czogRmxvYXQzMkFycmF5O1xuXHRpbmRpY2VzOiBudW1iZXJbXTtcblx0Y29sb3I6IENvbG9yO1xuXHRkYXJrQ29sb3I6IENvbG9yO1xuXHRkYXJrVGludDogYm9vbGVhbjtcblx0c2tpcFJlbmRlcjogYm9vbGVhbjtcblx0dGV4dHVyZTogVGV4dHVyZTtcblx0Y2xpcHBlZERhdGE/OiB7XG5cdFx0dmVydGljZXM6IEZsb2F0MzJBcnJheTtcblx0XHR1dnM6IEZsb2F0MzJBcnJheTtcblx0XHRpbmRpY2VzOiBVaW50MTZBcnJheTtcblx0XHR2ZXJ0ZXhDb3VudDogbnVtYmVyO1xuXHRcdGluZGljZXNDb3VudDogbnVtYmVyO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgU2xvdHNUb0NsaXBwaW5nIHtcblx0c2xvdDogU2xvdCxcblx0bWFzaz86IEdyYXBoaWNzLFxuXHRtYXNrQ29tcHV0ZWQ/OiBib29sZWFuLFxuXHR2ZXJ0aWNlczogQXJyYXk8bnVtYmVyPixcbn07XG5cbmNvbnN0IG1hc2tQb29sID0gbmV3IFBvb2w8R3JhcGhpY3M+KCgpID0+IG5ldyBHcmFwaGljcyk7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRvIGluc3RhbnRpYXRlIGEge0BsaW5rIFNwaW5lfSBnYW1lIG9iamVjdCBpbiBQaXhpLlxuICogVGhlIHN0YXRpYyBtZXRob2Qge0BsaW5rIFNwaW5lLmZyb219IHNob3VsZCBiZSB1c2VkIHRvIGluc3RhbnRpYXRlIGEgU3BpbmUgZ2FtZSBvYmplY3QuXG4gKi9cbmV4cG9ydCBjbGFzcyBTcGluZSBleHRlbmRzIFZpZXdDb250YWluZXIge1xuXHQvLyBQaXhpIHByb3BlcnRpZXNcblx0cHVibGljIGJhdGNoZWQgPSB0cnVlO1xuXHRwdWJsaWMgYnVpbGRJZCA9IDA7XG5cdHB1YmxpYyBvdmVycmlkZSByZWFkb25seSByZW5kZXJQaXBlSWQgPSAnc3BpbmUnO1xuXHRwdWJsaWMgX2RpZFNwaW5lVXBkYXRlID0gZmFsc2U7XG5cblx0cHVibGljIGJlZm9yZVVwZGF0ZVdvcmxkVHJhbnNmb3JtczogKG9iamVjdDogU3BpbmUpID0+IHZvaWQgPSAoKSA9PiB7IC8qKiAqLyB9O1xuXHRwdWJsaWMgYWZ0ZXJVcGRhdGVXb3JsZFRyYW5zZm9ybXM6IChvYmplY3Q6IFNwaW5lKSA9PiB2b2lkID0gKCkgPT4geyAvKiogKi8gfTtcblxuXHQvLyBTcGluZSBwcm9wZXJ0aWVzXG5cdC8qKiBUaGUgc2tlbGV0b24gZm9yIHRoaXMgU3BpbmUgZ2FtZSBvYmplY3QuICovXG5cdHB1YmxpYyBza2VsZXRvbjogU2tlbGV0b247XG5cdC8qKiBUaGUgYW5pbWF0aW9uIHN0YXRlIGZvciB0aGlzIFNwaW5lIGdhbWUgb2JqZWN0LiAqL1xuXHRwdWJsaWMgc3RhdGU6IEFuaW1hdGlvblN0YXRlO1xuXHRwdWJsaWMgc2tlbGV0b25Cb3VuZHM/OiBTa2VsZXRvbkJvdW5kcztcblxuXHRwcml2YXRlIGRhcmtUaW50ID0gZmFsc2U7XG5cdHByaXZhdGUgX2RlYnVnPzogSVNwaW5lRGVidWdSZW5kZXJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBfc2xvdHNPYmplY3Q6IFJlY29yZDxzdHJpbmcsIHsgc2xvdDogU2xvdCwgY29udGFpbmVyOiBDb250YWluZXIgfSB8IG51bGw+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0cHJpdmF0ZSBjbGlwcGluZ1Nsb3RUb1BpeGlNYXNrczogUmVjb3JkPHN0cmluZywgU2xvdHNUb0NsaXBwaW5nPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0cHJpdmF0ZSBnZXRTbG90RnJvbVJlZiAoc2xvdFJlZjogbnVtYmVyIHwgc3RyaW5nIHwgU2xvdCk6IFNsb3Qge1xuXHRcdGxldCBzbG90OiBTbG90IHwgbnVsbDtcblxuXHRcdGlmICh0eXBlb2Ygc2xvdFJlZiA9PT0gJ251bWJlcicpIHNsb3QgPSB0aGlzLnNrZWxldG9uLnNsb3RzW3Nsb3RSZWZdO1xuXHRcdGVsc2UgaWYgKHR5cGVvZiBzbG90UmVmID09PSAnc3RyaW5nJykgc2xvdCA9IHRoaXMuc2tlbGV0b24uZmluZFNsb3Qoc2xvdFJlZik7XG5cdFx0ZWxzZSBzbG90ID0gc2xvdFJlZjtcblxuXHRcdGlmICghc2xvdCkgdGhyb3cgbmV3IEVycm9yKGBObyBzbG90IGZvdW5kIHdpdGggdGhlIGdpdmVuIHNsb3QgcmVmZXJlbmNlOiAke3Nsb3RSZWZ9YCk7XG5cblx0XHRyZXR1cm4gc2xvdDtcblx0fVxuXG5cdHB1YmxpYyBzcGluZUF0dGFjaG1lbnRzRGlydHkgPSB0cnVlO1xuXHRwdWJsaWMgc3BpbmVUZXh0dXJlc0RpcnR5ID0gdHJ1ZTtcblxuXHRwcml2YXRlIF9sYXN0QXR0YWNobWVudHM6IEF0dGFjaG1lbnRbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3N0YXRlQ2hhbmdlZCA9IHRydWU7XG5cdHByaXZhdGUgYXR0YWNobWVudENhY2hlRGF0YTogUmVjb3JkPHN0cmluZywgQXR0YWNobWVudENhY2hlRGF0YT5bXSA9IFtdO1xuXG5cdHB1YmxpYyBnZXQgZGVidWcgKCk6IElTcGluZURlYnVnUmVuZGVyZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Zztcblx0fVxuXG5cdC8qKiBQYXNzIGEge0BsaW5rIFNwaW5lRGVidWdSZW5kZXJlcn0gb3IgY3JlYXRlIHlvdXIgb3duIHtAbGluayBJU3BpbmVEZWJ1Z1JlbmRlcmVyfSB0byByZW5kZXIgYm9uZXMsIG1lc2hlcywgLi4uXG5cdCAqIEBleGFtcGxlIHNwaW5lR08uZGVidWcgPSBuZXcgU3BpbmVEZWJ1Z1JlbmRlcmVyKCk7XG5cdCAqL1xuXHRwdWJsaWMgc2V0IGRlYnVnICh2YWx1ZTogSVNwaW5lRGVidWdSZW5kZXJlciB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9kZWJ1Zykge1xuXHRcdFx0dGhpcy5fZGVidWcudW5yZWdpc3RlclNwaW5lKHRoaXMpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHZhbHVlLnJlZ2lzdGVyU3BpbmUodGhpcyk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlYnVnID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9hdXRvVXBkYXRlID0gdHJ1ZTtcblxuXHRwdWJsaWMgZ2V0IGF1dG9VcGRhdGUgKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvVXBkYXRlO1xuXHR9XG5cdC8qKiBXaGVuIGB0cnVlYCwgdGhlIFNwaW5lIEFuaW1hdGlvblN0YXRlIGFuZCB0aGUgU2tlbGV0b24gd2lsbCBiZSBhdXRvbWF0aWNhbGx5IHVwZGF0ZWQgdXNpbmcgdGhlIHtAbGluayBUaWNrZXIuc2hhcmVkfSBpbnN0YW5jZS4gKi9cblx0cHVibGljIHNldCBhdXRvVXBkYXRlICh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0VGlja2VyLnNoYXJlZC5hZGQodGhpcy5pbnRlcm5hbFVwZGF0ZSwgdGhpcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdFRpY2tlci5zaGFyZWQucmVtb3ZlKHRoaXMuaW50ZXJuYWxVcGRhdGUsIHRoaXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2F1dG9VcGRhdGUgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgaGFzTmV2ZXJVcGRhdGVkID0gdHJ1ZTtcblx0Y29uc3RydWN0b3IgKG9wdGlvbnM6IFNwaW5lT3B0aW9ucyB8IFNrZWxldG9uRGF0YSkge1xuXHRcdGlmIChvcHRpb25zIGluc3RhbmNlb2YgU2tlbGV0b25EYXRhKSB7XG5cdFx0XHRvcHRpb25zID0ge1xuXHRcdFx0XHRza2VsZXRvbkRhdGE6IG9wdGlvbnMsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBza2VsZXRvbkRhdGEgPSBvcHRpb25zIGluc3RhbmNlb2YgU2tlbGV0b25EYXRhID8gb3B0aW9ucyA6IG9wdGlvbnMuc2tlbGV0b25EYXRhO1xuXG5cdFx0dGhpcy5za2VsZXRvbiA9IG5ldyBTa2VsZXRvbihza2VsZXRvbkRhdGEpO1xuXHRcdHRoaXMuc3RhdGUgPSBuZXcgQW5pbWF0aW9uU3RhdGUobmV3IEFuaW1hdGlvblN0YXRlRGF0YShza2VsZXRvbkRhdGEpKTtcblx0XHR0aGlzLmF1dG9VcGRhdGUgPSBvcHRpb25zPy5hdXRvVXBkYXRlID8/IHRydWU7XG5cblx0XHQvLyBkYXJrIHRpbnQgY2FuIGJlIGVuYWJsZWQgYnkgb3B0aW9ucywgb3RoZXJ3aXNlIGlzIGVuYWJsZSBpZiBhdCBsZWFzdCBvbmUgc2xvdCBoYXMgdGludCBibGFja1xuXHRcdHRoaXMuZGFya1RpbnQgPSBvcHRpb25zPy5kYXJrVGludCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHRoaXMuc2tlbGV0b24uc2xvdHMuc29tZShzbG90ID0+ICEhc2xvdC5kYXRhLmRhcmtDb2xvcilcblx0XHRcdDogb3B0aW9ucz8uZGFya1RpbnQ7XG5cblx0XHRjb25zdCBzbG90cyA9IHRoaXMuc2tlbGV0b24uc2xvdHM7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNsb3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLmF0dGFjaG1lbnRDYWNoZURhdGFbaV0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBJZiB7QGxpbmsgU3BpbmUuYXV0b1VwZGF0ZX0gaXMgYGZhbHNlYCwgdGhpcyBtZXRob2QgYWxsb3dzIHRvIHVwZGF0ZSB0aGUgQW5pbWF0aW9uU3RhdGUgYW5kIHRoZSBTa2VsZXRvbiB3aXRoIHRoZSBnaXZlbiBkZWx0YS4gKi9cblx0cHVibGljIHVwZGF0ZSAoZHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuaW50ZXJuYWxVcGRhdGUoMCwgZHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGludGVybmFsVXBkYXRlIChfZGVsdGFGcmFtZTogYW55LCBkZWx0YVNlY29uZHM/OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBCZWNhdXNlIHJlYXNvbnMsIHBpeGkgdXNlcyBkZWx0YUZyYW1lcyBhdCA2MGZwcy5cblx0XHQvLyBXZSBpZ25vcmUgdGhlIGRlZmF1bHQgZGVsdGFGcmFtZXMgYW5kIHVzZSB0aGUgZGVsdGFTZWNvbmRzIGZyb20gcGl4aSB0aWNrZXIuXG5cdFx0dGhpcy5fdXBkYXRlQW5kQXBwbHlTdGF0ZShkZWx0YVNlY29uZHMgPz8gVGlja2VyLnNoYXJlZC5kZWx0YU1TIC8gMTAwMCk7XG5cdH1cblxuXHRnZXQgYm91bmRzICgpIHtcblx0XHRpZiAodGhpcy5fYm91bmRzRGlydHkpIHtcblx0XHRcdHRoaXMudXBkYXRlQm91bmRzKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2JvdW5kcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBib25lIGdpdmVuIGluIGlucHV0IHRocm91Z2ggYSB7QGxpbmsgSVBvaW50RGF0YX0uXG5cdCAqIEBwYXJhbSBib25lOiB0aGUgYm9uZSBuYW1lIG9yIHRoZSBib25lIGluc3RhbmNlIHRvIHNldCB0aGUgcG9zaXRpb25cblx0ICogQHBhcmFtIG91dFBvczogdGhlIG5ldyBwb3NpdGlvbiBvZiB0aGUgYm9uZS5cblx0ICogQHRocm93cyB7RXJyb3J9OiBpZiB0aGUgZ2l2ZW4gYm9uZSBpcyBub3QgZm91bmQgaW4gdGhlIHNrZWxldG9uLCBhbiBlcnJvciBpcyB0aHJvd25cblx0ICovXG5cdHB1YmxpYyBzZXRCb25lUG9zaXRpb24gKGJvbmU6IHN0cmluZyB8IEJvbmUsIHBvc2l0aW9uOiBQb2ludERhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBib25lQXV4ID0gYm9uZTtcblxuXHRcdGlmICh0eXBlb2YgYm9uZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGJvbmUgPSB0aGlzLnNrZWxldG9uLmZpbmRCb25lKGJvbmUpIGFzIEJvbmU7XG5cdFx0fVxuXG5cdFx0aWYgKCFib25lKSB0aHJvdyBFcnJvcihgQ2FudCBzZXQgYm9uZSBwb3NpdGlvbiwgYm9uZSAke1N0cmluZyhib25lQXV4KX0gbm90IGZvdW5kYCk7XG5cdFx0dmVjdG9yQXV4LnNldChwb3NpdGlvbi54LCBwb3NpdGlvbi55KTtcblxuXHRcdGlmIChib25lLnBhcmVudCkge1xuXHRcdFx0Y29uc3QgYXV4ID0gYm9uZS5wYXJlbnQud29ybGRUb0xvY2FsKHZlY3RvckF1eCk7XG5cblx0XHRcdGJvbmUueCA9IGF1eC54O1xuXHRcdFx0Ym9uZS55ID0gLWF1eC55O1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGJvbmUueCA9IHZlY3RvckF1eC54O1xuXHRcdFx0Ym9uZS55ID0gdmVjdG9yQXV4Lnk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGJvbmUgZ2l2ZW4gaW4gaW5wdXQgaW50byBhbiB7QGxpbmsgSVBvaW50RGF0YX0uXG5cdCAqIEBwYXJhbSBib25lOiB0aGUgYm9uZSBuYW1lIG9yIHRoZSBib25lIGluc3RhbmNlIHRvIGdldCB0aGUgcG9zaXRpb24gZnJvbVxuXHQgKiBAcGFyYW0gb3V0UG9zOiBhbiBvcHRpb25hbCB7QGxpbmsgSVBvaW50RGF0YX0gdG8gdXNlIHRvIHJldHVybiB0aGUgYm9uZSBwb3NpdGlvbiwgcmF0aGVybiB0aGFuIGluc3RhbnRpYXRpbmcgYSBuZXcgb2JqZWN0LlxuXHQgKiBAcmV0dXJucyB7SVBvaW50RGF0YSB8IHVuZGVmaW5lZH06IHRoZSBwb3NpdGlvbiBvZiB0aGUgYm9uZSwgb3IgdW5kZWZpbmVkIGlmIG5vIG1hdGNoaW5nIGJvbmUgaXMgZm91bmQgaW4gdGhlIHNrZWxldG9uXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Qm9uZVBvc2l0aW9uIChib25lOiBzdHJpbmcgfCBCb25lLCBvdXRQb3M/OiBQb2ludERhdGEpOiBQb2ludERhdGEgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJvbmVBdXggPSBib25lO1xuXG5cdFx0aWYgKHR5cGVvZiBib25lID09PSAnc3RyaW5nJykge1xuXHRcdFx0Ym9uZSA9IHRoaXMuc2tlbGV0b24uZmluZEJvbmUoYm9uZSkgYXMgQm9uZTtcblx0XHR9XG5cblx0XHRpZiAoIWJvbmUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYENhbnQgc2V0IGJvbmUgcG9zaXRpb24hIEJvbmUgJHtTdHJpbmcoYm9uZUF1eCl9IG5vdCBmb3VuZGApO1xuXG5cdFx0XHRyZXR1cm4gb3V0UG9zO1xuXHRcdH1cblxuXHRcdGlmICghb3V0UG9zKSB7XG5cdFx0XHRvdXRQb3MgPSB7IHg6IDAsIHk6IDAgfTtcblx0XHR9XG5cblx0XHRvdXRQb3MueCA9IGJvbmUud29ybGRYO1xuXHRcdG91dFBvcy55ID0gYm9uZS53b3JsZFk7XG5cblx0XHRyZXR1cm4gb3V0UG9zO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkdmFuY2UgdGhlIHN0YXRlIGFuZCBza2VsZXRvbiBieSB0aGUgZ2l2ZW4gdGltZSwgdGhlbiB1cGRhdGUgc2xvdCBvYmplY3RzIHRvby5cblx0ICogVGhlIGNvbnRhaW5lciB0cmFuc2Zvcm0gaXMgbm90IHVwZGF0ZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSB0aW1lIHRoZSB0aW1lIGF0IHdoaWNoIHRvIHNldCB0aGUgc3RhdGVcblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUFuZEFwcGx5U3RhdGUgKHRpbWU6IG51bWJlcikge1xuXHRcdHRoaXMuaGFzTmV2ZXJVcGRhdGVkID0gZmFsc2U7XG5cblx0XHR0aGlzLnN0YXRlLnVwZGF0ZSh0aW1lKTtcblx0XHR0aGlzLnNrZWxldG9uLnVwZGF0ZSh0aW1lKTtcblxuXHRcdGNvbnN0IHsgc2tlbGV0b24gfSA9IHRoaXM7XG5cblx0XHR0aGlzLnN0YXRlLmFwcGx5KHNrZWxldG9uKTtcblxuXHRcdHRoaXMuYmVmb3JlVXBkYXRlV29ybGRUcmFuc2Zvcm1zKHRoaXMpO1xuXHRcdHNrZWxldG9uLnVwZGF0ZVdvcmxkVHJhbnNmb3JtKFBoeXNpY3MudXBkYXRlKTtcblx0XHR0aGlzLmFmdGVyVXBkYXRlV29ybGRUcmFuc2Zvcm1zKHRoaXMpO1xuXG5cdFx0dGhpcy51cGRhdGVTbG90T2JqZWN0cygpO1xuXG5cdFx0dGhpcy5fc3RhdGVDaGFuZ2VkID0gdHJ1ZTtcblxuXHRcdHRoaXMuX2JvdW5kc0RpcnR5ID0gdHJ1ZTtcblxuXHRcdHRoaXMub25WaWV3VXBkYXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogLSB2YWxpZGF0ZXMgdGhlIGF0dGFjaG1lbnRzIC0gdG8gZmxhZyBpZiB0aGUgYXR0YWNobWVudHMgaGF2ZSBjaGFuZ2VkIHRoaXMgc3RhdGVcblx0ICogLSB0cmFuc2Zvcm1zIHRoZSBhdHRhY2htZW50cyAtIHRvIHVwZGF0ZSB0aGUgdmVydGljZXMgb2YgdGhlIGF0dGFjaG1lbnRzIGJhc2VkIG9uIHRoZSBuZXcgcG9zaXRpb25zXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0X3ZhbGlkYXRlQW5kVHJhbnNmb3JtQXR0YWNobWVudHMgKCkge1xuXHRcdGlmICghdGhpcy5fc3RhdGVDaGFuZ2VkKSByZXR1cm47XG5cdFx0dGhpcy5fc3RhdGVDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHR0aGlzLnZhbGlkYXRlQXR0YWNobWVudHMoKTtcblxuXHRcdHRoaXMudHJhbnNmb3JtQXR0YWNobWVudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVBdHRhY2htZW50cyAoKSB7XG5cdFx0Y29uc3QgY3VycmVudERyYXdPcmRlciA9IHRoaXMuc2tlbGV0b24uZHJhd09yZGVyO1xuXG5cdFx0Y29uc3QgbGFzdEF0dGFjaG1lbnRzID0gdGhpcy5fbGFzdEF0dGFjaG1lbnRzO1xuXG5cdFx0bGV0IGluZGV4ID0gMDtcblxuXHRcdGxldCBzcGluZUF0dGFjaG1lbnRzRGlydHkgPSBmYWxzZTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY3VycmVudERyYXdPcmRlci5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgc2xvdCA9IGN1cnJlbnREcmF3T3JkZXJbaV07XG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cblx0XHRcdGlmIChhdHRhY2htZW50KSB7XG5cdFx0XHRcdGlmIChhdHRhY2htZW50ICE9PSBsYXN0QXR0YWNobWVudHNbaW5kZXhdKSB7XG5cdFx0XHRcdFx0c3BpbmVBdHRhY2htZW50c0RpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0XHRsYXN0QXR0YWNobWVudHNbaW5kZXhdID0gYXR0YWNobWVudDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGluZGV4ICE9PSBsYXN0QXR0YWNobWVudHMubGVuZ3RoKSB7XG5cdFx0XHRzcGluZUF0dGFjaG1lbnRzRGlydHkgPSB0cnVlO1xuXHRcdFx0bGFzdEF0dGFjaG1lbnRzLmxlbmd0aCA9IGluZGV4O1xuXHRcdH1cblxuXHRcdHRoaXMuc3BpbmVBdHRhY2htZW50c0RpcnR5ID0gc3BpbmVBdHRhY2htZW50c0RpcnR5O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBbmRTZXRQaXhpTWFzayAoc2xvdDogU2xvdCwgbGFzdDogYm9vbGVhbikge1xuXHRcdC8vIGFzc2lnbi9jcmVhdGUgdGhlIGN1cnJlbnRDbGlwcGluZ1Nsb3Rcblx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5hdHRhY2htZW50O1xuXHRcdGlmIChhdHRhY2htZW50ICYmIGF0dGFjaG1lbnQgaW5zdGFuY2VvZiBDbGlwcGluZ0F0dGFjaG1lbnQpIHtcblx0XHRcdGNvbnN0IGNsaXAgPSAodGhpcy5jbGlwcGluZ1Nsb3RUb1BpeGlNYXNrc1tzbG90LmRhdGEubmFtZV0gfHw9IHsgc2xvdCwgdmVydGljZXM6IG5ldyBBcnJheTxudW1iZXI+KCkgfSk7XG5cdFx0XHRjbGlwLm1hc2tDb21wdXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jdXJyZW50Q2xpcHBpbmdTbG90ID0gdGhpcy5jbGlwcGluZ1Nsb3RUb1BpeGlNYXNrc1tzbG90LmRhdGEubmFtZV07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gYXNzaWduIHRoZSBjdXJyZW50Q2xpcHBpbmdTbG90IG1hc2sgdG8gdGhlIHNsb3Qgb2JqZWN0XG5cdFx0bGV0IGN1cnJlbnRDbGlwcGluZ1Nsb3QgPSB0aGlzLmN1cnJlbnRDbGlwcGluZ1Nsb3Q7XG5cdFx0bGV0IHNsb3RPYmplY3QgPSB0aGlzLl9zbG90c09iamVjdFtzbG90LmRhdGEubmFtZV07XG5cdFx0aWYgKGN1cnJlbnRDbGlwcGluZ1Nsb3QgJiYgc2xvdE9iamVjdCkge1xuXHRcdFx0bGV0IHNsb3RDbGlwcGluZyA9IGN1cnJlbnRDbGlwcGluZ1Nsb3Quc2xvdDtcblx0XHRcdGxldCBjbGlwcGluZ0F0dGFjaG1lbnQgPSBzbG90Q2xpcHBpbmcuYXR0YWNobWVudCBhcyBDbGlwcGluZ0F0dGFjaG1lbnQ7XG5cblx0XHRcdC8vIGNyZWF0ZSB0aGUgcGl4aSBtYXNrLCBvbmx5IHRoZSBmaXJzdCB0aW1lIGFuZCBpZiB0aGUgY2xpcHBlZCBzbG90IGlzIHRoZSBmaXJzdCBvbmUgY2xpcHBlZCBieSB0aGlzIGN1cnJlbnRDbGlwcGluZ1Nsb3Rcblx0XHRcdGxldCBtYXNrID0gY3VycmVudENsaXBwaW5nU2xvdC5tYXNrIGFzIEdyYXBoaWNzO1xuXHRcdFx0aWYgKCFtYXNrKSB7XG5cdFx0XHRcdG1hc2sgPSBtYXNrUG9vbC5vYnRhaW4oKTtcblx0XHRcdFx0Y3VycmVudENsaXBwaW5nU2xvdC5tYXNrID0gbWFzaztcblx0XHRcdFx0dGhpcy5hZGRDaGlsZChtYXNrKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY29tcHV0ZSB0aGUgcGl4aSBtYXNrIHBvbHlnb24sIGlmIHRoZSBjbGlwcGVkIHNsb3QgaXMgdGhlIGZpcnN0IG9uZSBjbGlwcGVkIGJ5IHRoaXMgY3VycmVudENsaXBwaW5nU2xvdFxuXHRcdFx0aWYgKCFjdXJyZW50Q2xpcHBpbmdTbG90Lm1hc2tDb21wdXRlZCkge1xuXHRcdFx0XHRjdXJyZW50Q2xpcHBpbmdTbG90Lm1hc2tDb21wdXRlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHdvcmxkVmVydGljZXNMZW5ndGggPSBjbGlwcGluZ0F0dGFjaG1lbnQud29ybGRWZXJ0aWNlc0xlbmd0aDtcblx0XHRcdFx0Y29uc3QgdmVydGljZXMgPSBjdXJyZW50Q2xpcHBpbmdTbG90LnZlcnRpY2VzO1xuXHRcdFx0XHRjbGlwcGluZ0F0dGFjaG1lbnQuY29tcHV0ZVdvcmxkVmVydGljZXMoc2xvdENsaXBwaW5nLCAwLCB3b3JsZFZlcnRpY2VzTGVuZ3RoLCB2ZXJ0aWNlcywgMCwgMik7XG5cdFx0XHRcdG1hc2suY2xlYXIoKS5wb2x5KHZlcnRpY2VzKS5zdHJva2UoeyB3aWR0aDogMCB9KS5maWxsKHsgYWxwaGE6IC4yNSB9KTtcblx0XHRcdH1cblx0XHRcdHNsb3RPYmplY3QuY29udGFpbmVyLm1hc2sgPSBtYXNrO1xuXHRcdH0gZWxzZSBpZiAoc2xvdE9iamVjdD8uY29udGFpbmVyLm1hc2spIHtcblx0XHRcdC8vIHJlbW92ZSB0aGUgbWFzaywgaWYgc2xvdCBvYmplY3QgaGFzIGEgbWFzaywgYnV0IGN1cnJlbnRDbGlwcGluZ1Nsb3QgaXMgdW5kZWZpbmVkXG5cdFx0XHRzbG90T2JqZWN0LmNvbnRhaW5lci5tYXNrID0gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBpZiBjdXJyZW50IHNsb3QgaXMgdGhlIGVuZGluZyBvbmUgb2YgdGhlIGN1cnJlbnRDbGlwcGluZ1Nsb3QgbWFzaywgc2V0IGN1cnJlbnRDbGlwcGluZ1Nsb3QgdG8gdW5kZWZpbmVkXG5cdFx0aWYgKGN1cnJlbnRDbGlwcGluZ1Nsb3QgJiYgKGN1cnJlbnRDbGlwcGluZ1Nsb3Quc2xvdC5hdHRhY2htZW50IGFzIENsaXBwaW5nQXR0YWNobWVudCkuZW5kU2xvdCA9PSBzbG90LmRhdGEpIHtcblx0XHRcdHRoaXMuY3VycmVudENsaXBwaW5nU2xvdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBjbGVhbiB1cCB1bnVzZWQgbWFza3Ncblx0XHRpZiAobGFzdCkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gdGhpcy5jbGlwcGluZ1Nsb3RUb1BpeGlNYXNrcykge1xuXHRcdFx0XHRjb25zdCBjbGlwcGluZ1Nsb3RUb1BpeGlNYXNrID0gdGhpcy5jbGlwcGluZ1Nsb3RUb1BpeGlNYXNrc1trZXldO1xuXHRcdFx0XHRpZiAoKCEoY2xpcHBpbmdTbG90VG9QaXhpTWFzay5zbG90LmF0dGFjaG1lbnQgaW5zdGFuY2VvZiBDbGlwcGluZ0F0dGFjaG1lbnQpIHx8ICFjbGlwcGluZ1Nsb3RUb1BpeGlNYXNrLm1hc2tDb21wdXRlZCkgJiYgY2xpcHBpbmdTbG90VG9QaXhpTWFzay5tYXNrKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVDaGlsZChjbGlwcGluZ1Nsb3RUb1BpeGlNYXNrLm1hc2spO1xuXHRcdFx0XHRcdG1hc2tQb29sLmZyZWUoY2xpcHBpbmdTbG90VG9QaXhpTWFzay5tYXNrKTtcblx0XHRcdFx0XHRjbGlwcGluZ1Nsb3RUb1BpeGlNYXNrLm1hc2sgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGN1cnJlbnRDbGlwcGluZ1Nsb3Q6IFNsb3RzVG9DbGlwcGluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmFuc2Zvcm1BdHRhY2htZW50cyAoKSB7XG5cdFx0Y29uc3QgY3VycmVudERyYXdPcmRlciA9IHRoaXMuc2tlbGV0b24uZHJhd09yZGVyO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjdXJyZW50RHJhd09yZGVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzbG90ID0gY3VycmVudERyYXdPcmRlcltpXTtcblxuXHRcdFx0dGhpcy51cGRhdGVBbmRTZXRQaXhpTWFzayhzbG90LCBpID09PSBjdXJyZW50RHJhd09yZGVyLmxlbmd0aCAtIDEpO1xuXG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cblx0XHRcdGlmIChhdHRhY2htZW50KSB7XG5cdFx0XHRcdGlmIChhdHRhY2htZW50IGluc3RhbmNlb2YgTWVzaEF0dGFjaG1lbnQgfHwgYXR0YWNobWVudCBpbnN0YW5jZW9mIFJlZ2lvbkF0dGFjaG1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBjYWNoZURhdGEgPSB0aGlzLl9nZXRDYWNoZWREYXRhKHNsb3QsIGF0dGFjaG1lbnQpO1xuXG5cdFx0XHRcdFx0aWYgKGF0dGFjaG1lbnQgaW5zdGFuY2VvZiBSZWdpb25BdHRhY2htZW50KSB7XG5cdFx0XHRcdFx0XHRhdHRhY2htZW50LmNvbXB1dGVXb3JsZFZlcnRpY2VzKHNsb3QsIGNhY2hlRGF0YS52ZXJ0aWNlcywgMCwgMik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0YXR0YWNobWVudC5jb21wdXRlV29ybGRWZXJ0aWNlcyhcblx0XHRcdFx0XHRcdFx0c2xvdCxcblx0XHRcdFx0XHRcdFx0MCxcblx0XHRcdFx0XHRcdFx0YXR0YWNobWVudC53b3JsZFZlcnRpY2VzTGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRjYWNoZURhdGEudmVydGljZXMsXG5cdFx0XHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0XHRcdDIsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIHNlcXVlbmNlcyB1dnMgYXJlIGtub3duIG9ubHkgYWZ0ZXIgY29tcHV0ZVdvcmxkVmVydGljZXMgaXMgaW52b2tlZFxuXHRcdFx0XHRcdGlmIChjYWNoZURhdGEudXZzLmxlbmd0aCA8IGF0dGFjaG1lbnQudXZzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Y2FjaGVEYXRhLnV2cyA9IG5ldyBGbG9hdDMyQXJyYXkoYXR0YWNobWVudC51dnMubGVuZ3RoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBuZWVkIHRvIGNvcHkgYmVjYXVzZSBhdHRhY2htZW50cyB1dnMgYXJlIHNoYXJlZCBhbW9uZyBza2VsZXRvbnMgdXNpbmcgdGhlIHNhbWUgYXRsYXNcblx0XHRcdFx0XHRmYXN0Q29weSgoYXR0YWNobWVudC51dnMgYXMgRmxvYXQzMkFycmF5KS5idWZmZXIsIGNhY2hlRGF0YS51dnMuYnVmZmVyKTtcblxuXHRcdFx0XHRcdGNvbnN0IHNrZWxldG9uID0gc2xvdC5ib25lLnNrZWxldG9uO1xuXHRcdFx0XHRcdGNvbnN0IHNrZWxldG9uQ29sb3IgPSBza2VsZXRvbi5jb2xvcjtcblx0XHRcdFx0XHRjb25zdCBzbG90Q29sb3IgPSBzbG90LmNvbG9yO1xuXG5cdFx0XHRcdFx0Y29uc3QgYXR0YWNobWVudENvbG9yID0gYXR0YWNobWVudC5jb2xvcjtcblxuXHRcdFx0XHRcdGNhY2hlRGF0YS5jb2xvci5zZXQoXG5cdFx0XHRcdFx0XHRza2VsZXRvbkNvbG9yLnIgKiBzbG90Q29sb3IuciAqIGF0dGFjaG1lbnRDb2xvci5yLFxuXHRcdFx0XHRcdFx0c2tlbGV0b25Db2xvci5nICogc2xvdENvbG9yLmcgKiBhdHRhY2htZW50Q29sb3IuZyxcblx0XHRcdFx0XHRcdHNrZWxldG9uQ29sb3IuYiAqIHNsb3RDb2xvci5iICogYXR0YWNobWVudENvbG9yLmIsXG5cdFx0XHRcdFx0XHRza2VsZXRvbkNvbG9yLmEgKiBzbG90Q29sb3IuYSAqIGF0dGFjaG1lbnRDb2xvci5hLFxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRpZiAoc2xvdC5kYXJrQ29sb3IpIHtcblx0XHRcdFx0XHRcdGNhY2hlRGF0YS5kYXJrQ29sb3Iuc2V0RnJvbUNvbG9yKHNsb3QuZGFya0NvbG9yKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYWNoZURhdGEuc2tpcFJlbmRlciA9IGNhY2hlRGF0YS5jbGlwcGVkID0gZmFsc2U7XG5cblx0XHRcdFx0XHRjb25zdCB0ZXh0dXJlID0gYXR0YWNobWVudC5yZWdpb24/LnRleHR1cmUudGV4dHVyZSB8fCBUZXh0dXJlLkVNUFRZO1xuXG5cdFx0XHRcdFx0aWYgKGNhY2hlRGF0YS50ZXh0dXJlICE9PSB0ZXh0dXJlKSB7XG5cdFx0XHRcdFx0XHRjYWNoZURhdGEudGV4dHVyZSA9IHRleHR1cmU7XG5cdFx0XHRcdFx0XHR0aGlzLnNwaW5lVGV4dHVyZXNEaXJ0eSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGNsaXBwZXIuaXNDbGlwcGluZygpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNsaXBwaW5nRGF0YShjYWNoZURhdGEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChhdHRhY2htZW50IGluc3RhbmNlb2YgQ2xpcHBpbmdBdHRhY2htZW50KSB7XG5cdFx0XHRcdFx0Y2xpcHBlci5jbGlwU3RhcnQoc2xvdCwgYXR0YWNobWVudCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNsaXBwZXIuY2xpcEVuZFdpdGhTbG90KHNsb3QpO1xuXHRcdH1cblx0XHRjbGlwcGVyLmNsaXBFbmQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2xpcHBpbmdEYXRhIChjYWNoZURhdGE6IEF0dGFjaG1lbnRDYWNoZURhdGEpIHtcblx0XHRjYWNoZURhdGEuY2xpcHBlZCA9IHRydWU7XG5cblx0XHRjbGlwcGVyLmNsaXBUcmlhbmdsZXNVbnBhY2tlZChcblx0XHRcdGNhY2hlRGF0YS52ZXJ0aWNlcyxcblx0XHRcdGNhY2hlRGF0YS5pbmRpY2VzLFxuXHRcdFx0Y2FjaGVEYXRhLmluZGljZXMubGVuZ3RoLFxuXHRcdFx0Y2FjaGVEYXRhLnV2cyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgeyBjbGlwcGVkVmVydGljZXMsIGNsaXBwZWRVVnMsIGNsaXBwZWRUcmlhbmdsZXMgfSA9IGNsaXBwZXI7XG5cblx0XHRjb25zdCB2ZXJ0aWNlc0NvdW50ID0gY2xpcHBlZFZlcnRpY2VzLmxlbmd0aCAvIDI7XG5cdFx0Y29uc3QgaW5kaWNlc0NvdW50ID0gY2xpcHBlZFRyaWFuZ2xlcy5sZW5ndGg7XG5cblx0XHRpZiAoIWNhY2hlRGF0YS5jbGlwcGVkRGF0YSkge1xuXHRcdFx0Y2FjaGVEYXRhLmNsaXBwZWREYXRhID0ge1xuXHRcdFx0XHR2ZXJ0aWNlczogbmV3IEZsb2F0MzJBcnJheSh2ZXJ0aWNlc0NvdW50ICogMiksXG5cdFx0XHRcdHV2czogbmV3IEZsb2F0MzJBcnJheSh2ZXJ0aWNlc0NvdW50ICogMiksXG5cdFx0XHRcdHZlcnRleENvdW50OiB2ZXJ0aWNlc0NvdW50LFxuXHRcdFx0XHRpbmRpY2VzOiBuZXcgVWludDE2QXJyYXkoaW5kaWNlc0NvdW50KSxcblx0XHRcdFx0aW5kaWNlc0NvdW50LFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5zcGluZUF0dGFjaG1lbnRzRGlydHkgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsaXBwZWREYXRhID0gY2FjaGVEYXRhLmNsaXBwZWREYXRhO1xuXG5cdFx0Y29uc3Qgc2l6ZUNoYW5nZSA9IGNsaXBwZWREYXRhLnZlcnRleENvdW50ICE9PSB2ZXJ0aWNlc0NvdW50IHx8IGluZGljZXNDb3VudCAhPT0gY2xpcHBlZERhdGEuaW5kaWNlc0NvdW50O1xuXG5cdFx0Y2FjaGVEYXRhLnNraXBSZW5kZXIgPSB2ZXJ0aWNlc0NvdW50ID09PSAwO1xuXG5cdFx0aWYgKHNpemVDaGFuZ2UpIHtcblx0XHRcdHRoaXMuc3BpbmVBdHRhY2htZW50c0RpcnR5ID0gdHJ1ZTtcblxuXHRcdFx0aWYgKGNsaXBwZWREYXRhLnZlcnRleENvdW50IDwgdmVydGljZXNDb3VudCkge1xuXHRcdFx0XHQvLyBidWZmZXIgcmV1c2UhXG5cdFx0XHRcdGNsaXBwZWREYXRhLnZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheSh2ZXJ0aWNlc0NvdW50ICogMik7XG5cdFx0XHRcdGNsaXBwZWREYXRhLnV2cyA9IG5ldyBGbG9hdDMyQXJyYXkodmVydGljZXNDb3VudCAqIDIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2xpcHBlZERhdGEuaW5kaWNlcy5sZW5ndGggPCBpbmRpY2VzQ291bnQpIHtcblx0XHRcdFx0Y2xpcHBlZERhdGEuaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShpbmRpY2VzQ291bnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHsgdmVydGljZXMsIHV2cywgaW5kaWNlcyB9ID0gY2xpcHBlZERhdGE7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRpY2VzQ291bnQ7IGkrKykge1xuXHRcdFx0dmVydGljZXNbaSAqIDJdID0gY2xpcHBlZFZlcnRpY2VzW2kgKiAyXTtcblx0XHRcdHZlcnRpY2VzWyhpICogMikgKyAxXSA9IGNsaXBwZWRWZXJ0aWNlc1soaSAqIDIpICsgMV07XG5cblx0XHRcdHV2c1tpICogMl0gPSBjbGlwcGVkVVZzWyhpICogMildO1xuXHRcdFx0dXZzWyhpICogMikgKyAxXSA9IGNsaXBwZWRVVnNbKGkgKiAyKSArIDFdO1xuXHRcdH1cblxuXHRcdGNsaXBwZWREYXRhLnZlcnRleENvdW50ID0gdmVydGljZXNDb3VudDtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5kaWNlc0NvdW50OyBpKyspIHtcblx0XHRcdGlmIChpbmRpY2VzW2ldICE9PSBjbGlwcGVkVHJpYW5nbGVzW2ldKSB7XG5cdFx0XHRcdHRoaXMuc3BpbmVBdHRhY2htZW50c0RpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0aW5kaWNlc1tpXSA9IGNsaXBwZWRUcmlhbmdsZXNbaV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2xpcHBlZERhdGEuaW5kaWNlc0NvdW50ID0gaW5kaWNlc0NvdW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIGVuc3VyZSB0aGF0IGF0dGFjaGVkIGNvbnRhaW5lcnMgbWFwIGNvcnJlY3RseSB0byB0aGVpciBzbG90c1xuXHQgKiBhbG9uZyB3aXRoIHRoZWlyIHBvc2l0aW9uLCByb3RhdGlvbiwgc2NhbGUsIGFuZCB2aXNpYmlsaXR5LlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVTbG90T2JqZWN0cyAoKSB7XG5cdFx0Zm9yIChjb25zdCBpIGluIHRoaXMuX3Nsb3RzT2JqZWN0KSB7XG5cdFx0XHRjb25zdCBzbG90QXR0YWNobWVudCA9IHRoaXMuX3Nsb3RzT2JqZWN0W2ldO1xuXG5cdFx0XHRpZiAoIXNsb3RBdHRhY2htZW50KSBjb250aW51ZTtcblxuXHRcdFx0dGhpcy51cGRhdGVTbG90T2JqZWN0KHNsb3RBdHRhY2htZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNsb3RPYmplY3QgKHNsb3RBdHRhY2htZW50OiB7IHNsb3Q6IFNsb3QsIGNvbnRhaW5lcjogQ29udGFpbmVyIH0pIHtcblx0XHRjb25zdCB7IHNsb3QsIGNvbnRhaW5lciB9ID0gc2xvdEF0dGFjaG1lbnQ7XG5cblx0XHRjb250YWluZXIudmlzaWJsZSA9IHRoaXMuc2tlbGV0b24uZHJhd09yZGVyLmluY2x1ZGVzKHNsb3QpO1xuXG5cdFx0aWYgKGNvbnRhaW5lci52aXNpYmxlKSB7XG5cdFx0XHRjb25zdCBib25lID0gc2xvdC5ib25lO1xuXG5cdFx0XHRjb250YWluZXIucG9zaXRpb24uc2V0KGJvbmUud29ybGRYLCBib25lLndvcmxkWSk7XG5cblx0XHRcdGNvbnRhaW5lci5zY2FsZS54ID0gYm9uZS5nZXRXb3JsZFNjYWxlWCgpO1xuXHRcdFx0Y29udGFpbmVyLnNjYWxlLnkgPSBib25lLmdldFdvcmxkU2NhbGVZKCk7XG5cblx0XHRcdGNvbnRhaW5lci5yb3RhdGlvbiA9IGJvbmUuZ2V0V29ybGRSb3RhdGlvblgoKSAqIERFR19UT19SQUQ7XG5cblx0XHRcdGNvbnRhaW5lci5hbHBoYSA9IHRoaXMuc2tlbGV0b24uY29sb3IuYSAqIHNsb3QuY29sb3IuYTtcblx0XHR9XG5cdH1cblxuXHQvKiogQGludGVybmFsICovXG5cdF9nZXRDYWNoZWREYXRhIChzbG90OiBTbG90LCBhdHRhY2htZW50OiBSZWdpb25BdHRhY2htZW50IHwgTWVzaEF0dGFjaG1lbnQpOiBBdHRhY2htZW50Q2FjaGVEYXRhIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRhY2htZW50Q2FjaGVEYXRhW3Nsb3QuZGF0YS5pbmRleF1bYXR0YWNobWVudC5uYW1lXSB8fCB0aGlzLmluaXRDYWNoZWREYXRhKHNsb3QsIGF0dGFjaG1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0Q2FjaGVkRGF0YSAoc2xvdDogU2xvdCwgYXR0YWNobWVudDogUmVnaW9uQXR0YWNobWVudCB8IE1lc2hBdHRhY2htZW50KTogQXR0YWNobWVudENhY2hlRGF0YSB7XG5cdFx0bGV0IHZlcnRpY2VzOiBGbG9hdDMyQXJyYXk7XG5cblx0XHRpZiAoYXR0YWNobWVudCBpbnN0YW5jZW9mIFJlZ2lvbkF0dGFjaG1lbnQpIHtcblx0XHRcdHZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheSg4KTtcblxuXHRcdFx0dGhpcy5hdHRhY2htZW50Q2FjaGVEYXRhW3Nsb3QuZGF0YS5pbmRleF1bYXR0YWNobWVudC5uYW1lXSA9IHtcblx0XHRcdFx0aWQ6IGAke3Nsb3QuZGF0YS5pbmRleH0tJHthdHRhY2htZW50Lm5hbWV9YCxcblx0XHRcdFx0dmVydGljZXMsXG5cdFx0XHRcdGNsaXBwZWQ6IGZhbHNlLFxuXHRcdFx0XHRpbmRpY2VzOiBbMCwgMSwgMiwgMCwgMiwgM10sXG5cdFx0XHRcdHV2czogbmV3IEZsb2F0MzJBcnJheShhdHRhY2htZW50LnV2cy5sZW5ndGgpLFxuXHRcdFx0XHRjb2xvcjogbmV3IENvbG9yKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHRkYXJrQ29sb3I6IG5ldyBDb2xvcigwLCAwLCAwLCAwKSxcblx0XHRcdFx0ZGFya1RpbnQ6IHRoaXMuZGFya1RpbnQsXG5cdFx0XHRcdHNraXBSZW5kZXI6IGZhbHNlLFxuXHRcdFx0XHR0ZXh0dXJlOiBhdHRhY2htZW50LnJlZ2lvbj8udGV4dHVyZS50ZXh0dXJlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR2ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkoYXR0YWNobWVudC53b3JsZFZlcnRpY2VzTGVuZ3RoKTtcblxuXHRcdFx0dGhpcy5hdHRhY2htZW50Q2FjaGVEYXRhW3Nsb3QuZGF0YS5pbmRleF1bYXR0YWNobWVudC5uYW1lXSA9IHtcblx0XHRcdFx0aWQ6IGAke3Nsb3QuZGF0YS5pbmRleH0tJHthdHRhY2htZW50Lm5hbWV9YCxcblx0XHRcdFx0dmVydGljZXMsXG5cdFx0XHRcdGNsaXBwZWQ6IGZhbHNlLFxuXHRcdFx0XHRpbmRpY2VzOiBhdHRhY2htZW50LnRyaWFuZ2xlcyxcblx0XHRcdFx0dXZzOiBuZXcgRmxvYXQzMkFycmF5KGF0dGFjaG1lbnQudXZzLmxlbmd0aCksXG5cdFx0XHRcdGNvbG9yOiBuZXcgQ29sb3IoMSwgMSwgMSwgMSksXG5cdFx0XHRcdGRhcmtDb2xvcjogbmV3IENvbG9yKDAsIDAsIDAsIDApLFxuXHRcdFx0XHRkYXJrVGludDogdGhpcy5kYXJrVGludCxcblx0XHRcdFx0c2tpcFJlbmRlcjogZmFsc2UsXG5cdFx0XHRcdHRleHR1cmU6IGF0dGFjaG1lbnQucmVnaW9uPy50ZXh0dXJlLnRleHR1cmUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmF0dGFjaG1lbnRDYWNoZURhdGFbc2xvdC5kYXRhLmluZGV4XVthdHRhY2htZW50Lm5hbWVdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uVmlld1VwZGF0ZSAoKSB7XG5cdFx0Ly8gaW5jcmVtZW50IGZyb20gdGhlIDEydGggYml0IVxuXHRcdHRoaXMuX2RpZENoYW5nZUlkICs9IDEgPDwgMTI7XG5cblx0XHR0aGlzLl9ib3VuZHNEaXJ0eSA9IHRydWU7XG5cblx0XHRpZiAodGhpcy5kaWRWaWV3VXBkYXRlKSByZXR1cm47XG5cdFx0dGhpcy5kaWRWaWV3VXBkYXRlID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHJlbmRlckdyb3VwID0gdGhpcy5yZW5kZXJHcm91cCB8fCB0aGlzLnBhcmVudFJlbmRlckdyb3VwO1xuXG5cdFx0aWYgKHJlbmRlckdyb3VwKSB7XG5cdFx0XHRyZW5kZXJHcm91cC5vbkNoaWxkVmlld1VwZGF0ZSh0aGlzKTtcblx0XHR9XG5cblx0XHR0aGlzLmRlYnVnPy5yZW5kZXJEZWJ1Zyh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBdHRhY2hlcyBhIFBpeGlKUyBjb250YWluZXIgdG8gYSBzcGVjaWZpZWQgc2xvdC4gVGhpcyB3aWxsIG1hcCB0aGUgd29ybGQgdHJhbnNmb3JtIG9mIHRoZSBzbG90cyBib25lXG5cdCAqIHRvIHRoZSBhdHRhY2hlZCBjb250YWluZXIuIEEgY29udGFpbmVyIGNhbiBvbmx5IGJlIGF0dGFjaGVkIHRvIG9uZSBzbG90IGF0IGEgdGltZS5cblx0ICpcblx0ICogQHBhcmFtIGNvbnRhaW5lciAtIFRoZSBjb250YWluZXIgdG8gYXR0YWNoIHRvIHRoZSBzbG90XG5cdCAqIEBwYXJhbSBzbG90UmVmIC0gVGhlIHNsb3QgaWQgb3IgIHNsb3QgdG8gYXR0YWNoIHRvXG5cdCAqL1xuXHRwdWJsaWMgYWRkU2xvdE9iamVjdCAoc2xvdDogbnVtYmVyIHwgc3RyaW5nIHwgU2xvdCwgY29udGFpbmVyOiBDb250YWluZXIpIHtcblx0XHRzbG90ID0gdGhpcy5nZXRTbG90RnJvbVJlZihzbG90KTtcblxuXHRcdC8vIG5lZWQgdG8gY2hlY2sgaW4gb24gdGhlIGNvbnRhaW5lciB0b28uLi5cblx0XHRmb3IgKGNvbnN0IGkgaW4gdGhpcy5fc2xvdHNPYmplY3QpIHtcblx0XHRcdGlmICh0aGlzLl9zbG90c09iamVjdFtpXT8uY29udGFpbmVyID09PSBjb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVTbG90T2JqZWN0KHRoaXMuX3Nsb3RzT2JqZWN0W2ldLnNsb3QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVtb3ZlU2xvdE9iamVjdChzbG90KTtcblxuXHRcdGNvbnRhaW5lci5pbmNsdWRlSW5CdWlsZCA9IGZhbHNlO1xuXG5cdFx0Ly8gVE9ETyBvbmx5IGFkZCBvbmNlPz9cblx0XHR0aGlzLmFkZENoaWxkKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzbG90T2JqZWN0ID0geyBjb250YWluZXIsIHNsb3QgfTtcblx0XHR0aGlzLl9zbG90c09iamVjdFtzbG90LmRhdGEubmFtZV0gPSBzbG90T2JqZWN0O1xuXG5cdFx0dGhpcy51cGRhdGVTbG90T2JqZWN0KHNsb3RPYmplY3QpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBQaXhpSlMgY29udGFpbmVyIGZyb20gdGhlIHNsb3QgaXQgaXMgYXR0YWNoZWQgdG8uXG5cdCAqXG5cdCAqIEBwYXJhbSBjb250YWluZXIgLSBUaGUgY29udGFpbmVyIHRvIGRldGFjaCBmcm9tIHRoZSBzbG90XG5cdCAqIEBwYXJhbSBzbG90T3JDb250YWluZXIgLSBUaGUgY29udGFpbmVyLCBzbG90IGlkIG9yIHNsb3QgdG8gZGV0YWNoIGZyb21cblx0ICovXG5cdHB1YmxpYyByZW1vdmVTbG90T2JqZWN0IChzbG90T3JDb250YWluZXI6IG51bWJlciB8IHN0cmluZyB8IFNsb3QgfCBDb250YWluZXIpIHtcblx0XHRsZXQgY29udGFpbmVyVG9SZW1vdmU6IENvbnRhaW5lciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzbG90T3JDb250YWluZXIgaW5zdGFuY2VvZiBDb250YWluZXIpIHtcblx0XHRcdGZvciAoY29uc3QgaSBpbiB0aGlzLl9zbG90c09iamVjdCkge1xuXHRcdFx0XHRpZiAodGhpcy5fc2xvdHNPYmplY3RbaV0/LmNvbnRhaW5lciA9PT0gc2xvdE9yQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2xvdHNPYmplY3RbaV0gPSBudWxsO1xuXG5cdFx0XHRcdFx0Y29udGFpbmVyVG9SZW1vdmUgPSBzbG90T3JDb250YWluZXI7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBzbG90ID0gdGhpcy5nZXRTbG90RnJvbVJlZihzbG90T3JDb250YWluZXIpO1xuXG5cdFx0XHRjb250YWluZXJUb1JlbW92ZSA9IHRoaXMuX3Nsb3RzT2JqZWN0W3Nsb3QuZGF0YS5uYW1lXT8uY29udGFpbmVyO1xuXHRcdFx0dGhpcy5fc2xvdHNPYmplY3Rbc2xvdC5kYXRhLm5hbWVdID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoY29udGFpbmVyVG9SZW1vdmUpIHtcblx0XHRcdHRoaXMucmVtb3ZlQ2hpbGQoY29udGFpbmVyVG9SZW1vdmUpO1xuXG5cdFx0XHRjb250YWluZXJUb1JlbW92ZS5pbmNsdWRlSW5CdWlsZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBjb250YWluZXIgYXR0YWNoZWQgdG8gYSBzbG90LCBvciB1bmRlZmluZWQgaWYgbm8gY29udGFpbmVyIGlzIGF0dGFjaGVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gc2xvdFJlZiAtIFRoZSBzbG90IGlkIG9yIHNsb3QgdG8gZ2V0IHRoZSBhdHRhY2htZW50IGZyb21cblx0ICogQHJldHVybnMgLSBUaGUgY29udGFpbmVyIGF0dGFjaGVkIHRvIHRoZSBzbG90XG5cdCAqL1xuXHRwdWJsaWMgZ2V0U2xvdE9iamVjdCAoc2xvdDogbnVtYmVyIHwgc3RyaW5nIHwgU2xvdCkge1xuXHRcdHNsb3QgPSB0aGlzLmdldFNsb3RGcm9tUmVmKHNsb3QpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3Nsb3RzT2JqZWN0W3Nsb3QuZGF0YS5uYW1lXT8uY29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCb3VuZHMgKCkge1xuXHRcdHRoaXMuX2JvdW5kc0RpcnR5ID0gZmFsc2U7XG5cblx0XHR0aGlzLnNrZWxldG9uQm91bmRzIHx8PSBuZXcgU2tlbGV0b25Cb3VuZHMoKTtcblxuXHRcdGNvbnN0IHNrZWxldG9uQm91bmRzID0gdGhpcy5za2VsZXRvbkJvdW5kcztcblxuXHRcdHNrZWxldG9uQm91bmRzLnVwZGF0ZSh0aGlzLnNrZWxldG9uLCB0cnVlKTtcblxuXHRcdGlmIChza2VsZXRvbkJvdW5kcy5taW5YID09PSBJbmZpbml0eSkge1xuXHRcdFx0aWYgKHRoaXMuaGFzTmV2ZXJVcGRhdGVkKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUFuZEFwcGx5U3RhdGUoMCk7XG5cdFx0XHRcdHRoaXMuX2JvdW5kc0RpcnR5ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl92YWxpZGF0ZUFuZFRyYW5zZm9ybUF0dGFjaG1lbnRzKCk7XG5cblx0XHRcdGNvbnN0IGRyYXdPcmRlciA9IHRoaXMuc2tlbGV0b24uZHJhd09yZGVyO1xuXHRcdFx0Y29uc3QgYm91bmRzID0gdGhpcy5fYm91bmRzO1xuXG5cdFx0XHRib3VuZHMuY2xlYXIoKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkcmF3T3JkZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc2xvdCA9IGRyYXdPcmRlcltpXTtcblxuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50ID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cblx0XHRcdFx0aWYgKGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQgaW5zdGFuY2VvZiBSZWdpb25BdHRhY2htZW50IHx8IGF0dGFjaG1lbnQgaW5zdGFuY2VvZiBNZXNoQXR0YWNobWVudCkpIHtcblx0XHRcdFx0XHRjb25zdCBjYWNoZURhdGEgPSB0aGlzLl9nZXRDYWNoZWREYXRhKHNsb3QsIGF0dGFjaG1lbnQpO1xuXG5cdFx0XHRcdFx0Ym91bmRzLmFkZFZlcnRleERhdGEoY2FjaGVEYXRhLnZlcnRpY2VzLCAwLCBjYWNoZURhdGEudmVydGljZXMubGVuZ3RoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuX2JvdW5kcy5taW5YID0gc2tlbGV0b25Cb3VuZHMubWluWDtcblx0XHRcdHRoaXMuX2JvdW5kcy5taW5ZID0gc2tlbGV0b25Cb3VuZHMubWluWTtcblx0XHRcdHRoaXMuX2JvdW5kcy5tYXhYID0gc2tlbGV0b25Cb3VuZHMubWF4WDtcblx0XHRcdHRoaXMuX2JvdW5kcy5tYXhZID0gc2tlbGV0b25Cb3VuZHMubWF4WTtcblx0XHR9XG5cdH1cblxuXHQvKiogQGludGVybmFsICovXG5cdGFkZEJvdW5kcyAoYm91bmRzOiBCb3VuZHMpIHtcblx0XHRib3VuZHMuYWRkQm91bmRzKHRoaXMuYm91bmRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGlzIHNwcml0ZSByZW5kZXJhYmxlIGFuZCBvcHRpb25hbGx5IGl0cyB0ZXh0dXJlLlxuXHQgKiBAcGFyYW0gb3B0aW9ucyAtIE9wdGlvbnMgcGFyYW1ldGVyLiBBIGJvb2xlYW4gd2lsbCBhY3QgYXMgaWYgYWxsIG9wdGlvbnNcblx0ICogIGhhdmUgYmVlbiBzZXQgdG8gdGhhdCB2YWx1ZVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnRleHR1cmU9ZmFsc2VdIC0gU2hvdWxkIGl0IGRlc3Ryb3kgdGhlIGN1cnJlbnQgdGV4dHVyZSBvZiB0aGUgcmVuZGVyYWJsZSBhcyB3ZWxsXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMudGV4dHVyZVNvdXJjZT1mYWxzZV0gLSBTaG91bGQgaXQgZGVzdHJveSB0aGUgdGV4dHVyZVNvdXJjZSBvZiB0aGUgcmVuZGVyYWJsZSBhcyB3ZWxsXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgZGVzdHJveSAob3B0aW9uczogRGVzdHJveU9wdGlvbnMgPSBmYWxzZSkge1xuXHRcdHN1cGVyLmRlc3Ryb3kob3B0aW9ucyk7XG5cblx0XHRUaWNrZXIuc2hhcmVkLnJlbW92ZSh0aGlzLmludGVybmFsVXBkYXRlLCB0aGlzKTtcblx0XHR0aGlzLnN0YXRlLmNsZWFyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5kZWJ1ZyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnNrZWxldG9uID0gbnVsbCBhcyBhbnk7XG5cdFx0dGhpcy5zdGF0ZSA9IG51bGwgYXMgYW55O1xuXHRcdCh0aGlzLl9zbG90c09iamVjdCBhcyBhbnkpID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0QXR0YWNobWVudHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLmF0dGFjaG1lbnRDYWNoZURhdGEgPSBudWxsIGFzIGFueTtcblx0fVxuXG5cdC8qKiBDb252ZXJ0cyBhIHBvaW50IGZyb20gdGhlIHNrZWxldG9uIGNvb3JkaW5hdGUgc3lzdGVtIHRvIHRoZSBQaXhpIHdvcmxkIGNvb3JkaW5hdGUgc3lzdGVtLiAqL1xuXHRwdWJsaWMgc2tlbGV0b25Ub1BpeGlXb3JsZENvb3JkaW5hdGVzIChwb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KSB7XG5cdFx0dGhpcy53b3JsZFRyYW5zZm9ybS5hcHBseShwb2ludCwgcG9pbnQpO1xuXHR9XG5cblx0LyoqIENvbnZlcnRzIGEgcG9pbnQgZnJvbSB0aGUgUGl4aSB3b3JsZCBjb29yZGluYXRlIHN5c3RlbSB0byB0aGUgc2tlbGV0b24gY29vcmRpbmF0ZSBzeXN0ZW0uICovXG5cdHB1YmxpYyBwaXhpV29ybGRDb29yZGluYXRlc1RvU2tlbGV0b24gKHBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pIHtcblx0XHR0aGlzLndvcmxkVHJhbnNmb3JtLmFwcGx5SW52ZXJzZShwb2ludCwgcG9pbnQpO1xuXHR9XG5cblx0LyoqIENvbnZlcnRzIGEgcG9pbnQgZnJvbSB0aGUgUGl4aSB3b3JsZCBjb29yZGluYXRlIHN5c3RlbSB0byB0aGUgYm9uZSdzIGxvY2FsIGNvb3JkaW5hdGUgc3lzdGVtLiAqL1xuXHRwdWJsaWMgcGl4aVdvcmxkQ29vcmRpbmF0ZXNUb0JvbmUgKHBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGJvbmU6IEJvbmUpIHtcblx0XHR0aGlzLnBpeGlXb3JsZENvb3JkaW5hdGVzVG9Ta2VsZXRvbihwb2ludCk7XG5cdFx0aWYgKGJvbmUucGFyZW50KSB7XG5cdFx0XHRib25lLnBhcmVudC53b3JsZFRvTG9jYWwocG9pbnQgYXMgVmVjdG9yMik7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Ym9uZS53b3JsZFRvTG9jYWwocG9pbnQgYXMgVmVjdG9yMik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVzZSB0aGlzIG1ldGhvZCB0byBpbnN0YW50aWF0ZSBhIFNwaW5lIGdhbWUgb2JqZWN0LlxuXHQgKiBCZWZvcmUgaW5zdGFudGlhdGluZyBhIFNwaW5lIGdhbWUgb2JqZWN0LCB0aGUgc2tlbGV0b24gKGAuc2tlbGAgb3IgYC5qc29uYCkgYW5kIHRoZSBhdGxhcyB0ZXh0IGZpbGVzIG11c3QgYmUgbG9hZGVkIGludG8gdGhlIEFzc2V0cy4gRm9yIGV4YW1wbGU6XG5cdCAqIGBgYFxuXHQgKiBQSVhJLkFzc2V0cy5hZGQoXCJzYWNrRGF0YVwiLCBcIi4vYXNzZXRzL3NhY2stcHJvLnNrZWxcIik7XG5cdCAqIFBJWEkuQXNzZXRzLmFkZChcInNhY2tBdGxhc1wiLCBcIi4vYXNzZXRzL3NhY2stcG1hLmF0bGFzXCIpO1xuXHQgKiBhd2FpdCBQSVhJLkFzc2V0cy5sb2FkKFtcInNhY2tEYXRhXCIsIFwic2Fja0F0bGFzXCJdKTtcblx0ICogYGBgXG5cdCAqIE9uY2UgYSBTcGluZSBnYW1lIG9iamVjdCBpcyBjcmVhdGVkLCBpdHMgc2tlbGV0b24gZGF0YSBpcyBjYWNoZWQgaW50byB7QGxpbmsgQ2FjaGV9IHVzaW5nIHRoZSBrZXk6XG5cdCAqIGAke3NrZWxldG9uQXNzZXROYW1lfS0ke2F0bGFzQXNzZXROYW1lfS0ke29wdGlvbnM/LnNjYWxlID8/IDF9YFxuXHQgKlxuXHQgKiBAcGFyYW0gb3B0aW9ucyAtIE9wdGlvbnMgdG8gY29uZmlndXJlIHRoZSBTcGluZSBnYW1lIG9iamVjdC4gU2VlIHtAbGluayBTcGluZUZyb21PcHRpb25zfVxuXHQgKiBAcmV0dXJucyB7U3BpbmV9IFRoZSBTcGluZSBnYW1lIG9iamVjdCBpbnN0YW50aWF0ZWRcblx0ICovXG5cdHN0YXRpYyBmcm9tICh7IHNrZWxldG9uLCBhdGxhcywgc2NhbGUgPSAxLCBkYXJrVGludCwgYXV0b1VwZGF0ZSA9IHRydWUgfTogU3BpbmVGcm9tT3B0aW9ucykge1xuXHRcdGNvbnN0IGNhY2hlS2V5ID0gYCR7c2tlbGV0b259LSR7YXRsYXN9LSR7c2NhbGV9YDtcblxuXHRcdGlmIChDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNwaW5lKENhY2hlLmdldDxTa2VsZXRvbkRhdGE+KGNhY2hlS2V5KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2tlbGV0b25Bc3NldCA9IEFzc2V0cy5nZXQ8YW55IHwgVWludDhBcnJheT4oc2tlbGV0b24pO1xuXG5cdFx0Y29uc3QgYXRsYXNBc3NldCA9IEFzc2V0cy5nZXQ8VGV4dHVyZUF0bGFzPihhdGxhcyk7XG5cdFx0Y29uc3QgYXR0YWNobWVudExvYWRlciA9IG5ldyBBdGxhc0F0dGFjaG1lbnRMb2FkZXIoYXRsYXNBc3NldCk7XG5cdFx0Y29uc3QgcGFyc2VyID0gc2tlbGV0b25Bc3NldCBpbnN0YW5jZW9mIFVpbnQ4QXJyYXlcblx0XHRcdD8gbmV3IFNrZWxldG9uQmluYXJ5KGF0dGFjaG1lbnRMb2FkZXIpXG5cdFx0XHQ6IG5ldyBTa2VsZXRvbkpzb24oYXR0YWNobWVudExvYWRlcik7XG5cblx0XHRwYXJzZXIuc2NhbGUgPSBzY2FsZTtcblx0XHRjb25zdCBza2VsZXRvbkRhdGEgPSBwYXJzZXIucmVhZFNrZWxldG9uRGF0YShza2VsZXRvbkFzc2V0KTtcblxuXHRcdENhY2hlLnNldChjYWNoZUtleSwgc2tlbGV0b25EYXRhKTtcblxuXHRcdHJldHVybiBuZXcgU3BpbmUoe1xuXHRcdFx0c2tlbGV0b25EYXRhLFxuXHRcdFx0ZGFya1RpbnQsXG5cdFx0XHRhdXRvVXBkYXRlLFxuXHRcdH0pO1xuXHR9XG59XG4iXX0=