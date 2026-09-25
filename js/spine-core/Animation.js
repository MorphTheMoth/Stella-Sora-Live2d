/******************************************************************************
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
import { VertexAttachment } from "./attachments/Attachment.js";
import { StringSet, Utils, MathUtils } from "./Utils.js";
import { SequenceMode, SequenceModeValues } from "./attachments/Sequence.js";
/** A simple container for a list of timelines and a name. */
export class Animation {
    /** The animation's name, which is unique across all animations in the skeleton. */
    name;
    timelines = [];
    timelineIds = new StringSet();
    /** The duration of the animation in seconds, which is the highest time of all keys in the timeline. */
    duration;
    constructor(name, timelines, duration) {
        if (!name)
            throw new Error("name cannot be null.");
        this.name = name;
        this.setTimelines(timelines);
        this.duration = duration;
    }
    setTimelines(timelines) {
        if (!timelines)
            throw new Error("timelines cannot be null.");
        this.timelines = timelines;
        this.timelineIds.clear();
        for (var i = 0; i < timelines.length; i++)
            this.timelineIds.addAll(timelines[i].getPropertyIds());
    }
    hasTimeline(ids) {
        for (let i = 0; i < ids.length; i++)
            if (this.timelineIds.contains(ids[i]))
                return true;
        return false;
    }
    /** Applies all the animation's timelines to the specified skeleton.
     *
     * See Timeline {@link Timeline#apply(Skeleton, float, float, Array, float, MixBlend, MixDirection)}.
     * @param loop If true, the animation repeats after {@link #getDuration()}.
     * @param events May be null to ignore fired events. */
    apply(skeleton, lastTime, time, loop, events, alpha, blend, direction) {
        if (!skeleton)
            throw new Error("skeleton cannot be null.");
        if (loop && this.duration != 0) {
            time %= this.duration;
            if (lastTime > 0)
                lastTime %= this.duration;
        }
        let timelines = this.timelines;
        for (let i = 0, n = timelines.length; i < n; i++)
            timelines[i].apply(skeleton, lastTime, time, events, alpha, blend, direction);
    }
}
/** Controls how a timeline value is mixed with the setup pose value or current pose value when a timeline's `alpha`
 * < 1.
 *
 * See Timeline {@link Timeline#apply(Skeleton, float, float, Array, float, MixBlend, MixDirection)}. */
export var MixBlend;
(function (MixBlend) {
    /** Transitions from the setup value to the timeline value (the current value is not used). Before the first key, the setup
     * value is set. */
    MixBlend[MixBlend["setup"] = 0] = "setup";
    /** Transitions from the current value to the timeline value. Before the first key, transitions from the current value to
     * the setup value. Timelines which perform instant transitions, such as {@link DrawOrderTimeline} or
     * {@link AttachmentTimeline}, use the setup value before the first key.
     *
     * `first` is intended for the first animations applied, not for animations layered on top of those. */
    MixBlend[MixBlend["first"] = 1] = "first";
    /** Transitions from the current value to the timeline value. No change is made before the first key (the current value is
     * kept until the first key).
     *
     * `replace` is intended for animations layered on top of others, not for the first animations applied. */
    MixBlend[MixBlend["replace"] = 2] = "replace";
    /** Transitions from the current value to the current value plus the timeline value. No change is made before the first key
     * (the current value is kept until the first key).
     *
     * `add` is intended for animations layered on top of others, not for the first animations applied. Properties
     * keyed by additive animations must be set manually or by another animation before applying the additive animations, else
     * the property values will increase continually. */
    MixBlend[MixBlend["add"] = 3] = "add";
})(MixBlend || (MixBlend = {}));
/** Indicates whether a timeline's `alpha` is mixing out over time toward 0 (the setup or current pose value) or
 * mixing in toward 1 (the timeline's value).
 *
 * See Timeline {@link Timeline#apply(Skeleton, float, float, Array, float, MixBlend, MixDirection)}. */
export var MixDirection;
(function (MixDirection) {
    MixDirection[MixDirection["mixIn"] = 0] = "mixIn";
    MixDirection[MixDirection["mixOut"] = 1] = "mixOut";
})(MixDirection || (MixDirection = {}));
const Property = {
    rotate: 0,
    x: 1,
    y: 2,
    scaleX: 3,
    scaleY: 4,
    shearX: 5,
    shearY: 6,
    inherit: 7,
    rgb: 8,
    alpha: 9,
    rgb2: 10,
    attachment: 11,
    deform: 12,
    event: 13,
    drawOrder: 14,
    ikConstraint: 15,
    transformConstraint: 16,
    pathConstraintPosition: 17,
    pathConstraintSpacing: 18,
    pathConstraintMix: 19,
    physicsConstraintInertia: 20,
    physicsConstraintStrength: 21,
    physicsConstraintDamping: 22,
    physicsConstraintMass: 23,
    physicsConstraintWind: 24,
    physicsConstraintGravity: 25,
    physicsConstraintMix: 26,
    physicsConstraintReset: 27,
    sequence: 28,
};
/** The interface for all timelines. */
export class Timeline {
    propertyIds;
    frames;
    constructor(frameCount, propertyIds) {
        this.propertyIds = propertyIds;
        this.frames = Utils.newFloatArray(frameCount * this.getFrameEntries());
    }
    getPropertyIds() {
        return this.propertyIds;
    }
    getFrameEntries() {
        return 1;
    }
    getFrameCount() {
        return this.frames.length / this.getFrameEntries();
    }
    getDuration() {
        return this.frames[this.frames.length - this.getFrameEntries()];
    }
    static search1(frames, time) {
        let n = frames.length;
        for (let i = 1; i < n; i++)
            if (frames[i] > time)
                return i - 1;
        return n - 1;
    }
    static search(frames, time, step) {
        let n = frames.length;
        for (let i = step; i < n; i += step)
            if (frames[i] > time)
                return i - step;
        return n - step;
    }
}
/** The base class for timelines that use interpolation between key frame values. */
export class CurveTimeline extends Timeline {
    curves; // type, x, y, ...
    constructor(frameCount, bezierCount, propertyIds) {
        super(frameCount, propertyIds);
        this.curves = Utils.newFloatArray(frameCount + bezierCount * 18 /*BEZIER_SIZE*/);
        this.curves[frameCount - 1] = 1 /*STEPPED*/;
    }
    /** Sets the specified key frame to linear interpolation. */
    setLinear(frame) {
        this.curves[frame] = 0 /*LINEAR*/;
    }
    /** Sets the specified key frame to stepped interpolation. */
    setStepped(frame) {
        this.curves[frame] = 1 /*STEPPED*/;
    }
    /** Shrinks the storage for Bezier curves, for use when <code>bezierCount</code> (specified in the constructor) was larger
     * than the actual number of Bezier curves. */
    shrink(bezierCount) {
        let size = this.getFrameCount() + bezierCount * 18 /*BEZIER_SIZE*/;
        if (this.curves.length > size) {
            let newCurves = Utils.newFloatArray(size);
            Utils.arrayCopy(this.curves, 0, newCurves, 0, size);
            this.curves = newCurves;
        }
    }
    /** Stores the segments for the specified Bezier curve. For timelines that modify multiple values, there may be more than
     * one curve per frame.
     * @param bezier The ordinal of this Bezier curve for this timeline, between 0 and <code>bezierCount - 1</code> (specified
     *           in the constructor), inclusive.
     * @param frame Between 0 and <code>frameCount - 1</code>, inclusive.
     * @param value The index of the value for this frame that this curve is used for.
     * @param time1 The time for the first key.
     * @param value1 The value for the first key.
     * @param cx1 The time for the first Bezier handle.
     * @param cy1 The value for the first Bezier handle.
     * @param cx2 The time of the second Bezier handle.
     * @param cy2 The value for the second Bezier handle.
     * @param time2 The time for the second key.
     * @param value2 The value for the second key. */
    setBezier(bezier, frame, value, time1, value1, cx1, cy1, cx2, cy2, time2, value2) {
        let curves = this.curves;
        let i = this.getFrameCount() + bezier * 18 /*BEZIER_SIZE*/;
        if (value == 0)
            curves[frame] = 2 /*BEZIER*/ + i;
        let tmpx = (time1 - cx1 * 2 + cx2) * 0.03, tmpy = (value1 - cy1 * 2 + cy2) * 0.03;
        let dddx = ((cx1 - cx2) * 3 - time1 + time2) * 0.006, dddy = ((cy1 - cy2) * 3 - value1 + value2) * 0.006;
        let ddx = tmpx * 2 + dddx, ddy = tmpy * 2 + dddy;
        let dx = (cx1 - time1) * 0.3 + tmpx + dddx * 0.16666667, dy = (cy1 - value1) * 0.3 + tmpy + dddy * 0.16666667;
        let x = time1 + dx, y = value1 + dy;
        for (let n = i + 18 /*BEZIER_SIZE*/; i < n; i += 2) {
            curves[i] = x;
            curves[i + 1] = y;
            dx += ddx;
            dy += ddy;
            ddx += dddx;
            ddy += dddy;
            x += dx;
            y += dy;
        }
    }
    /** Returns the Bezier interpolated value for the specified time.
     * @param frameIndex The index into {@link #getFrames()} for the values of the frame before <code>time</code>.
     * @param valueOffset The offset from <code>frameIndex</code> to the value this curve is used for.
     * @param i The index of the Bezier segments. See {@link #getCurveType(int)}. */
    getBezierValue(time, frameIndex, valueOffset, i) {
        let curves = this.curves;
        if (curves[i] > time) {
            let x = this.frames[frameIndex], y = this.frames[frameIndex + valueOffset];
            return y + (time - x) / (curves[i] - x) * (curves[i + 1] - y);
        }
        let n = i + 18 /*BEZIER_SIZE*/;
        for (i += 2; i < n; i += 2) {
            if (curves[i] >= time) {
                let x = curves[i - 2], y = curves[i - 1];
                return y + (time - x) / (curves[i] - x) * (curves[i + 1] - y);
            }
        }
        frameIndex += this.getFrameEntries();
        let x = curves[n - 2], y = curves[n - 1];
        return y + (time - x) / (this.frames[frameIndex] - x) * (this.frames[frameIndex + valueOffset] - y);
    }
}
export class CurveTimeline1 extends CurveTimeline {
    constructor(frameCount, bezierCount, propertyId) {
        super(frameCount, bezierCount, [propertyId]);
    }
    getFrameEntries() {
        return 2 /*ENTRIES*/;
    }
    /** Sets the time and value for the specified frame.
     * @param frame Between 0 and <code>frameCount</code>, inclusive.
     * @param time The frame time in seconds. */
    setFrame(frame, time, value) {
        frame <<= 1;
        this.frames[frame] = time;
        this.frames[frame + 1 /*VALUE*/] = value;
    }
    /** Returns the interpolated value for the specified time. */
    getCurveValue(time) {
        let frames = this.frames;
        let i = frames.length - 2;
        for (let ii = 2; ii <= i; ii += 2) {
            if (frames[ii] > time) {
                i = ii - 2;
                break;
            }
        }
        let curveType = this.curves[i >> 1];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i], value = frames[i + 1 /*VALUE*/];
                return value + (time - before) / (frames[i + 2 /*ENTRIES*/] - before) * (frames[i + 2 /*ENTRIES*/ + 1 /*VALUE*/] - value);
            case 1 /*STEPPED*/:
                return frames[i + 1 /*VALUE*/];
        }
        return this.getBezierValue(time, i, 1 /*VALUE*/, curveType - 2 /*BEZIER*/);
    }
    getRelativeValue(time, alpha, blend, current, setup) {
        if (time < this.frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    return setup;
                case MixBlend.first:
                    return current + (setup - current) * alpha;
            }
            return current;
        }
        let value = this.getCurveValue(time);
        switch (blend) {
            case MixBlend.setup:
                return setup + value * alpha;
            case MixBlend.first:
            case MixBlend.replace:
                value += setup - current;
        }
        return current + value * alpha;
    }
    getAbsoluteValue(time, alpha, blend, current, setup) {
        if (time < this.frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    return setup;
                case MixBlend.first:
                    return current + (setup - current) * alpha;
            }
            return current;
        }
        let value = this.getCurveValue(time);
        if (blend == MixBlend.setup)
            return setup + (value - setup) * alpha;
        return current + (value - current) * alpha;
    }
    getAbsoluteValue2(time, alpha, blend, current, setup, value) {
        if (time < this.frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    return setup;
                case MixBlend.first:
                    return current + (setup - current) * alpha;
            }
            return current;
        }
        if (blend == MixBlend.setup)
            return setup + (value - setup) * alpha;
        return current + (value - current) * alpha;
    }
    getScaleValue(time, alpha, blend, direction, current, setup) {
        const frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    return setup;
                case MixBlend.first:
                    return current + (setup - current) * alpha;
            }
            return current;
        }
        let value = this.getCurveValue(time) * setup;
        if (alpha == 1) {
            if (blend == MixBlend.add)
                return current + value - setup;
            return value;
        }
        // Mixing out uses sign of setup or current pose, else use sign of key.
        if (direction == MixDirection.mixOut) {
            switch (blend) {
                case MixBlend.setup:
                    return setup + (Math.abs(value) * MathUtils.signum(setup) - setup) * alpha;
                case MixBlend.first:
                case MixBlend.replace:
                    return current + (Math.abs(value) * MathUtils.signum(current) - current) * alpha;
            }
        }
        else {
            let s = 0;
            switch (blend) {
                case MixBlend.setup:
                    s = Math.abs(setup) * MathUtils.signum(value);
                    return s + (value - s) * alpha;
                case MixBlend.first:
                case MixBlend.replace:
                    s = Math.abs(current) * MathUtils.signum(value);
                    return s + (value - s) * alpha;
            }
        }
        return current + (value - setup) * alpha;
    }
}
/** The base class for a {@link CurveTimeline} which sets two properties. */
export class CurveTimeline2 extends CurveTimeline {
    /** @param bezierCount The maximum number of Bezier curves. See {@link #shrink(int)}.
     * @param propertyIds Unique identifiers for the properties the timeline modifies. */
    constructor(frameCount, bezierCount, propertyId1, propertyId2) {
        super(frameCount, bezierCount, [propertyId1, propertyId2]);
    }
    getFrameEntries() {
        return 3 /*ENTRIES*/;
    }
    /** Sets the time and values for the specified frame.
     * @param frame Between 0 and <code>frameCount</code>, inclusive.
     * @param time The frame time in seconds. */
    setFrame(frame, time, value1, value2) {
        frame *= 3 /*ENTRIES*/;
        this.frames[frame] = time;
        this.frames[frame + 1 /*VALUE1*/] = value1;
        this.frames[frame + 2 /*VALUE2*/] = value2;
    }
}
/** Changes a bone's local {@link Bone#rotation}. */
export class RotateTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.rotate + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.rotation = this.getRelativeValue(time, alpha, blend, bone.rotation, bone.data.rotation);
    }
}
/** Changes a bone's local {@link Bone#x} and {@link Bone#y}. */
export class TranslateTimeline extends CurveTimeline2 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.x + "|" + boneIndex, Property.y + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (!bone.active)
            return;
        let frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    bone.x = bone.data.x;
                    bone.y = bone.data.y;
                    return;
                case MixBlend.first:
                    bone.x += (bone.data.x - bone.x) * alpha;
                    bone.y += (bone.data.y - bone.y) * alpha;
            }
            return;
        }
        let x = 0, y = 0;
        let i = Timeline.search(frames, time, 3 /*ENTRIES*/);
        let curveType = this.curves[i / 3 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                x = frames[i + 1 /*VALUE1*/];
                y = frames[i + 2 /*VALUE2*/];
                let t = (time - before) / (frames[i + 3 /*ENTRIES*/] - before);
                x += (frames[i + 3 /*ENTRIES*/ + 1 /*VALUE1*/] - x) * t;
                y += (frames[i + 3 /*ENTRIES*/ + 2 /*VALUE2*/] - y) * t;
                break;
            case 1 /*STEPPED*/:
                x = frames[i + 1 /*VALUE1*/];
                y = frames[i + 2 /*VALUE2*/];
                break;
            default:
                x = this.getBezierValue(time, i, 1 /*VALUE1*/, curveType - 2 /*BEZIER*/);
                y = this.getBezierValue(time, i, 2 /*VALUE2*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
        }
        switch (blend) {
            case MixBlend.setup:
                bone.x = bone.data.x + x * alpha;
                bone.y = bone.data.y + y * alpha;
                break;
            case MixBlend.first:
            case MixBlend.replace:
                bone.x += (bone.data.x + x - bone.x) * alpha;
                bone.y += (bone.data.y + y - bone.y) * alpha;
                break;
            case MixBlend.add:
                bone.x += x * alpha;
                bone.y += y * alpha;
        }
    }
}
/** Changes a bone's local {@link Bone#x}. */
export class TranslateXTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.x + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.x = this.getRelativeValue(time, alpha, blend, bone.x, bone.data.x);
    }
}
/** Changes a bone's local {@link Bone#x}. */
export class TranslateYTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.y + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.y = this.getRelativeValue(time, alpha, blend, bone.y, bone.data.y);
    }
}
/** Changes a bone's local {@link Bone#scaleX)} and {@link Bone#scaleY}. */
export class ScaleTimeline extends CurveTimeline2 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.scaleX + "|" + boneIndex, Property.scaleY + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (!bone.active)
            return;
        let frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    bone.scaleX = bone.data.scaleX;
                    bone.scaleY = bone.data.scaleY;
                    return;
                case MixBlend.first:
                    bone.scaleX += (bone.data.scaleX - bone.scaleX) * alpha;
                    bone.scaleY += (bone.data.scaleY - bone.scaleY) * alpha;
            }
            return;
        }
        let x, y;
        let i = Timeline.search(frames, time, 3 /*ENTRIES*/);
        let curveType = this.curves[i / 3 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                x = frames[i + 1 /*VALUE1*/];
                y = frames[i + 2 /*VALUE2*/];
                let t = (time - before) / (frames[i + 3 /*ENTRIES*/] - before);
                x += (frames[i + 3 /*ENTRIES*/ + 1 /*VALUE1*/] - x) * t;
                y += (frames[i + 3 /*ENTRIES*/ + 2 /*VALUE2*/] - y) * t;
                break;
            case 1 /*STEPPED*/:
                x = frames[i + 1 /*VALUE1*/];
                y = frames[i + 2 /*VALUE2*/];
                break;
            default:
                x = this.getBezierValue(time, i, 1 /*VALUE1*/, curveType - 2 /*BEZIER*/);
                y = this.getBezierValue(time, i, 2 /*VALUE2*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
        }
        x *= bone.data.scaleX;
        y *= bone.data.scaleY;
        if (alpha == 1) {
            if (blend == MixBlend.add) {
                bone.scaleX += x - bone.data.scaleX;
                bone.scaleY += y - bone.data.scaleY;
            }
            else {
                bone.scaleX = x;
                bone.scaleY = y;
            }
        }
        else {
            let bx = 0, by = 0;
            if (direction == MixDirection.mixOut) {
                switch (blend) {
                    case MixBlend.setup:
                        bx = bone.data.scaleX;
                        by = bone.data.scaleY;
                        bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bx) * alpha;
                        bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - by) * alpha;
                        break;
                    case MixBlend.first:
                    case MixBlend.replace:
                        bx = bone.scaleX;
                        by = bone.scaleY;
                        bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bx) * alpha;
                        bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - by) * alpha;
                        break;
                    case MixBlend.add:
                        bone.scaleX += (x - bone.data.scaleX) * alpha;
                        bone.scaleY += (y - bone.data.scaleY) * alpha;
                }
            }
            else {
                switch (blend) {
                    case MixBlend.setup:
                        bx = Math.abs(bone.data.scaleX) * MathUtils.signum(x);
                        by = Math.abs(bone.data.scaleY) * MathUtils.signum(y);
                        bone.scaleX = bx + (x - bx) * alpha;
                        bone.scaleY = by + (y - by) * alpha;
                        break;
                    case MixBlend.first:
                    case MixBlend.replace:
                        bx = Math.abs(bone.scaleX) * MathUtils.signum(x);
                        by = Math.abs(bone.scaleY) * MathUtils.signum(y);
                        bone.scaleX = bx + (x - bx) * alpha;
                        bone.scaleY = by + (y - by) * alpha;
                        break;
                    case MixBlend.add:
                        bone.scaleX += (x - bone.data.scaleX) * alpha;
                        bone.scaleY += (y - bone.data.scaleY) * alpha;
                }
            }
        }
    }
}
/** Changes a bone's local {@link Bone#scaleX)} and {@link Bone#scaleY}. */
export class ScaleXTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.scaleX + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.scaleX = this.getScaleValue(time, alpha, blend, direction, bone.scaleX, bone.data.scaleX);
    }
}
/** Changes a bone's local {@link Bone#scaleX)} and {@link Bone#scaleY}. */
export class ScaleYTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.scaleY + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.scaleY = this.getScaleValue(time, alpha, blend, direction, bone.scaleY, bone.data.scaleY);
    }
}
/** Changes a bone's local {@link Bone#shearX} and {@link Bone#shearY}. */
export class ShearTimeline extends CurveTimeline2 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.shearX + "|" + boneIndex, Property.shearY + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (!bone.active)
            return;
        let frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    bone.shearX = bone.data.shearX;
                    bone.shearY = bone.data.shearY;
                    return;
                case MixBlend.first:
                    bone.shearX += (bone.data.shearX - bone.shearX) * alpha;
                    bone.shearY += (bone.data.shearY - bone.shearY) * alpha;
            }
            return;
        }
        let x = 0, y = 0;
        let i = Timeline.search(frames, time, 3 /*ENTRIES*/);
        let curveType = this.curves[i / 3 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                x = frames[i + 1 /*VALUE1*/];
                y = frames[i + 2 /*VALUE2*/];
                let t = (time - before) / (frames[i + 3 /*ENTRIES*/] - before);
                x += (frames[i + 3 /*ENTRIES*/ + 1 /*VALUE1*/] - x) * t;
                y += (frames[i + 3 /*ENTRIES*/ + 2 /*VALUE2*/] - y) * t;
                break;
            case 1 /*STEPPED*/:
                x = frames[i + 1 /*VALUE1*/];
                y = frames[i + 2 /*VALUE2*/];
                break;
            default:
                x = this.getBezierValue(time, i, 1 /*VALUE1*/, curveType - 2 /*BEZIER*/);
                y = this.getBezierValue(time, i, 2 /*VALUE2*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
        }
        switch (blend) {
            case MixBlend.setup:
                bone.shearX = bone.data.shearX + x * alpha;
                bone.shearY = bone.data.shearY + y * alpha;
                break;
            case MixBlend.first:
            case MixBlend.replace:
                bone.shearX += (bone.data.shearX + x - bone.shearX) * alpha;
                bone.shearY += (bone.data.shearY + y - bone.shearY) * alpha;
                break;
            case MixBlend.add:
                bone.shearX += x * alpha;
                bone.shearY += y * alpha;
        }
    }
}
/** Changes a bone's local {@link Bone#shearX} and {@link Bone#shearY}. */
export class ShearXTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.shearX + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.shearX = this.getRelativeValue(time, alpha, blend, bone.shearX, bone.data.shearX);
    }
}
/** Changes a bone's local {@link Bone#shearX} and {@link Bone#shearY}. */
export class ShearYTimeline extends CurveTimeline1 {
    boneIndex = 0;
    constructor(frameCount, bezierCount, boneIndex) {
        super(frameCount, bezierCount, Property.shearY + "|" + boneIndex);
        this.boneIndex = boneIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (bone.active)
            bone.shearY = this.getRelativeValue(time, alpha, blend, bone.shearY, bone.data.shearY);
    }
}
export class InheritTimeline extends Timeline {
    boneIndex = 0;
    constructor(frameCount, boneIndex) {
        super(frameCount, [Property.inherit + "|" + boneIndex]);
        this.boneIndex = boneIndex;
    }
    getFrameEntries() {
        return 2 /*ENTRIES*/;
    }
    /** Sets the transform mode for the specified frame.
     * @param frame Between 0 and <code>frameCount</code>, inclusive.
     * @param time The frame time in seconds. */
    setFrame(frame, time, inherit) {
        frame *= 2 /*ENTRIES*/;
        this.frames[frame] = time;
        this.frames[frame + 1 /*INHERIT*/] = inherit;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let bone = skeleton.bones[this.boneIndex];
        if (!bone.active)
            return;
        if (direction == MixDirection.mixOut) {
            if (blend == MixBlend.setup)
                bone.inherit = bone.data.inherit;
            return;
        }
        let frames = this.frames;
        if (time < frames[0]) {
            if (blend == MixBlend.setup || blend == MixBlend.first)
                bone.inherit = bone.data.inherit;
            return;
        }
        bone.inherit = this.frames[Timeline.search(frames, time, 2 /*ENTRIES*/) + 1 /*INHERIT*/];
    }
}
/** Changes a slot's {@link Slot#color}. */
export class RGBATimeline extends CurveTimeline {
    slotIndex = 0;
    constructor(frameCount, bezierCount, slotIndex) {
        super(frameCount, bezierCount, [
            Property.rgb + "|" + slotIndex,
            Property.alpha + "|" + slotIndex
        ]);
        this.slotIndex = slotIndex;
    }
    getFrameEntries() {
        return 5 /*ENTRIES*/;
    }
    /** Sets the time in seconds, red, green, blue, and alpha for the specified key frame. */
    setFrame(frame, time, r, g, b, a) {
        frame *= 5 /*ENTRIES*/;
        this.frames[frame] = time;
        this.frames[frame + 1 /*R*/] = r;
        this.frames[frame + 2 /*G*/] = g;
        this.frames[frame + 3 /*B*/] = b;
        this.frames[frame + 4 /*A*/] = a;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let frames = this.frames;
        let color = slot.color;
        if (time < frames[0]) {
            let setup = slot.data.color;
            switch (blend) {
                case MixBlend.setup:
                    color.setFromColor(setup);
                    return;
                case MixBlend.first:
                    color.add((setup.r - color.r) * alpha, (setup.g - color.g) * alpha, (setup.b - color.b) * alpha, (setup.a - color.a) * alpha);
            }
            return;
        }
        let r = 0, g = 0, b = 0, a = 0;
        let i = Timeline.search(frames, time, 5 /*ENTRIES*/);
        let curveType = this.curves[i / 5 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                a = frames[i + 4 /*A*/];
                let t = (time - before) / (frames[i + 5 /*ENTRIES*/] - before);
                r += (frames[i + 5 /*ENTRIES*/ + 1 /*R*/] - r) * t;
                g += (frames[i + 5 /*ENTRIES*/ + 2 /*G*/] - g) * t;
                b += (frames[i + 5 /*ENTRIES*/ + 3 /*B*/] - b) * t;
                a += (frames[i + 5 /*ENTRIES*/ + 4 /*A*/] - a) * t;
                break;
            case 1 /*STEPPED*/:
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                a = frames[i + 4 /*A*/];
                break;
            default:
                r = this.getBezierValue(time, i, 1 /*R*/, curveType - 2 /*BEZIER*/);
                g = this.getBezierValue(time, i, 2 /*G*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
                b = this.getBezierValue(time, i, 3 /*B*/, curveType + 18 /*BEZIER_SIZE*/ * 2 - 2 /*BEZIER*/);
                a = this.getBezierValue(time, i, 4 /*A*/, curveType + 18 /*BEZIER_SIZE*/ * 3 - 2 /*BEZIER*/);
        }
        if (alpha == 1)
            color.set(r, g, b, a);
        else {
            if (blend == MixBlend.setup)
                color.setFromColor(slot.data.color);
            color.add((r - color.r) * alpha, (g - color.g) * alpha, (b - color.b) * alpha, (a - color.a) * alpha);
        }
    }
}
/** Changes a slot's {@link Slot#color}. */
export class RGBTimeline extends CurveTimeline {
    slotIndex = 0;
    constructor(frameCount, bezierCount, slotIndex) {
        super(frameCount, bezierCount, [
            Property.rgb + "|" + slotIndex
        ]);
        this.slotIndex = slotIndex;
    }
    getFrameEntries() {
        return 4 /*ENTRIES*/;
    }
    /** Sets the time in seconds, red, green, blue, and alpha for the specified key frame. */
    setFrame(frame, time, r, g, b) {
        frame <<= 2;
        this.frames[frame] = time;
        this.frames[frame + 1 /*R*/] = r;
        this.frames[frame + 2 /*G*/] = g;
        this.frames[frame + 3 /*B*/] = b;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let frames = this.frames;
        let color = slot.color;
        if (time < frames[0]) {
            let setup = slot.data.color;
            switch (blend) {
                case MixBlend.setup:
                    color.r = setup.r;
                    color.g = setup.g;
                    color.b = setup.b;
                    return;
                case MixBlend.first:
                    color.r += (setup.r - color.r) * alpha;
                    color.g += (setup.g - color.g) * alpha;
                    color.b += (setup.b - color.b) * alpha;
            }
            return;
        }
        let r = 0, g = 0, b = 0;
        let i = Timeline.search(frames, time, 4 /*ENTRIES*/);
        let curveType = this.curves[i >> 2];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                let t = (time - before) / (frames[i + 4 /*ENTRIES*/] - before);
                r += (frames[i + 4 /*ENTRIES*/ + 1 /*R*/] - r) * t;
                g += (frames[i + 4 /*ENTRIES*/ + 2 /*G*/] - g) * t;
                b += (frames[i + 4 /*ENTRIES*/ + 3 /*B*/] - b) * t;
                break;
            case 1 /*STEPPED*/:
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                break;
            default:
                r = this.getBezierValue(time, i, 1 /*R*/, curveType - 2 /*BEZIER*/);
                g = this.getBezierValue(time, i, 2 /*G*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
                b = this.getBezierValue(time, i, 3 /*B*/, curveType + 18 /*BEZIER_SIZE*/ * 2 - 2 /*BEZIER*/);
        }
        if (alpha == 1) {
            color.r = r;
            color.g = g;
            color.b = b;
        }
        else {
            if (blend == MixBlend.setup) {
                let setup = slot.data.color;
                color.r = setup.r;
                color.g = setup.g;
                color.b = setup.b;
            }
            color.r += (r - color.r) * alpha;
            color.g += (g - color.g) * alpha;
            color.b += (b - color.b) * alpha;
        }
    }
}
/** Changes a bone's local {@link Bone#shearX} and {@link Bone#shearY}. */
export class AlphaTimeline extends CurveTimeline1 {
    slotIndex = 0;
    constructor(frameCount, bezierCount, slotIndex) {
        super(frameCount, bezierCount, Property.alpha + "|" + slotIndex);
        this.slotIndex = slotIndex;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let color = slot.color;
        if (time < this.frames[0]) {
            let setup = slot.data.color;
            switch (blend) {
                case MixBlend.setup:
                    color.a = setup.a;
                    return;
                case MixBlend.first:
                    color.a += (setup.a - color.a) * alpha;
            }
            return;
        }
        let a = this.getCurveValue(time);
        if (alpha == 1)
            color.a = a;
        else {
            if (blend == MixBlend.setup)
                color.a = slot.data.color.a;
            color.a += (a - color.a) * alpha;
        }
    }
}
/** Changes a slot's {@link Slot#color} and {@link Slot#darkColor} for two color tinting. */
export class RGBA2Timeline extends CurveTimeline {
    slotIndex = 0;
    constructor(frameCount, bezierCount, slotIndex) {
        super(frameCount, bezierCount, [
            Property.rgb + "|" + slotIndex,
            Property.alpha + "|" + slotIndex,
            Property.rgb2 + "|" + slotIndex
        ]);
        this.slotIndex = slotIndex;
    }
    getFrameEntries() {
        return 8 /*ENTRIES*/;
    }
    /** Sets the time in seconds, light, and dark colors for the specified key frame. */
    setFrame(frame, time, r, g, b, a, r2, g2, b2) {
        frame <<= 3;
        this.frames[frame] = time;
        this.frames[frame + 1 /*R*/] = r;
        this.frames[frame + 2 /*G*/] = g;
        this.frames[frame + 3 /*B*/] = b;
        this.frames[frame + 4 /*A*/] = a;
        this.frames[frame + 5 /*R2*/] = r2;
        this.frames[frame + 6 /*G2*/] = g2;
        this.frames[frame + 7 /*B2*/] = b2;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let frames = this.frames;
        let light = slot.color, dark = slot.darkColor;
        if (time < frames[0]) {
            let setupLight = slot.data.color, setupDark = slot.data.darkColor;
            switch (blend) {
                case MixBlend.setup:
                    light.setFromColor(setupLight);
                    dark.r = setupDark.r;
                    dark.g = setupDark.g;
                    dark.b = setupDark.b;
                    return;
                case MixBlend.first:
                    light.add((setupLight.r - light.r) * alpha, (setupLight.g - light.g) * alpha, (setupLight.b - light.b) * alpha, (setupLight.a - light.a) * alpha);
                    dark.r += (setupDark.r - dark.r) * alpha;
                    dark.g += (setupDark.g - dark.g) * alpha;
                    dark.b += (setupDark.b - dark.b) * alpha;
            }
            return;
        }
        let r = 0, g = 0, b = 0, a = 0, r2 = 0, g2 = 0, b2 = 0;
        let i = Timeline.search(frames, time, 8 /*ENTRIES*/);
        let curveType = this.curves[i >> 3];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                a = frames[i + 4 /*A*/];
                r2 = frames[i + 5 /*R2*/];
                g2 = frames[i + 6 /*G2*/];
                b2 = frames[i + 7 /*B2*/];
                let t = (time - before) / (frames[i + 8 /*ENTRIES*/] - before);
                r += (frames[i + 8 /*ENTRIES*/ + 1 /*R*/] - r) * t;
                g += (frames[i + 8 /*ENTRIES*/ + 2 /*G*/] - g) * t;
                b += (frames[i + 8 /*ENTRIES*/ + 3 /*B*/] - b) * t;
                a += (frames[i + 8 /*ENTRIES*/ + 4 /*A*/] - a) * t;
                r2 += (frames[i + 8 /*ENTRIES*/ + 5 /*R2*/] - r2) * t;
                g2 += (frames[i + 8 /*ENTRIES*/ + 6 /*G2*/] - g2) * t;
                b2 += (frames[i + 8 /*ENTRIES*/ + 7 /*B2*/] - b2) * t;
                break;
            case 1 /*STEPPED*/:
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                a = frames[i + 4 /*A*/];
                r2 = frames[i + 5 /*R2*/];
                g2 = frames[i + 6 /*G2*/];
                b2 = frames[i + 7 /*B2*/];
                break;
            default:
                r = this.getBezierValue(time, i, 1 /*R*/, curveType - 2 /*BEZIER*/);
                g = this.getBezierValue(time, i, 2 /*G*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
                b = this.getBezierValue(time, i, 3 /*B*/, curveType + 18 /*BEZIER_SIZE*/ * 2 - 2 /*BEZIER*/);
                a = this.getBezierValue(time, i, 4 /*A*/, curveType + 18 /*BEZIER_SIZE*/ * 3 - 2 /*BEZIER*/);
                r2 = this.getBezierValue(time, i, 5 /*R2*/, curveType + 18 /*BEZIER_SIZE*/ * 4 - 2 /*BEZIER*/);
                g2 = this.getBezierValue(time, i, 6 /*G2*/, curveType + 18 /*BEZIER_SIZE*/ * 5 - 2 /*BEZIER*/);
                b2 = this.getBezierValue(time, i, 7 /*B2*/, curveType + 18 /*BEZIER_SIZE*/ * 6 - 2 /*BEZIER*/);
        }
        if (alpha == 1) {
            light.set(r, g, b, a);
            dark.r = r2;
            dark.g = g2;
            dark.b = b2;
        }
        else {
            if (blend == MixBlend.setup) {
                light.setFromColor(slot.data.color);
                let setupDark = slot.data.darkColor;
                dark.r = setupDark.r;
                dark.g = setupDark.g;
                dark.b = setupDark.b;
            }
            light.add((r - light.r) * alpha, (g - light.g) * alpha, (b - light.b) * alpha, (a - light.a) * alpha);
            dark.r += (r2 - dark.r) * alpha;
            dark.g += (g2 - dark.g) * alpha;
            dark.b += (b2 - dark.b) * alpha;
        }
    }
}
/** Changes a slot's {@link Slot#color} and {@link Slot#darkColor} for two color tinting. */
export class RGB2Timeline extends CurveTimeline {
    slotIndex = 0;
    constructor(frameCount, bezierCount, slotIndex) {
        super(frameCount, bezierCount, [
            Property.rgb + "|" + slotIndex,
            Property.rgb2 + "|" + slotIndex
        ]);
        this.slotIndex = slotIndex;
    }
    getFrameEntries() {
        return 7 /*ENTRIES*/;
    }
    /** Sets the time in seconds, light, and dark colors for the specified key frame. */
    setFrame(frame, time, r, g, b, r2, g2, b2) {
        frame *= 7 /*ENTRIES*/;
        this.frames[frame] = time;
        this.frames[frame + 1 /*R*/] = r;
        this.frames[frame + 2 /*G*/] = g;
        this.frames[frame + 3 /*B*/] = b;
        this.frames[frame + 4 /*R2*/] = r2;
        this.frames[frame + 5 /*G2*/] = g2;
        this.frames[frame + 6 /*B2*/] = b2;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let frames = this.frames;
        let light = slot.color, dark = slot.darkColor;
        if (time < frames[0]) {
            let setupLight = slot.data.color, setupDark = slot.data.darkColor;
            switch (blend) {
                case MixBlend.setup:
                    light.r = setupLight.r;
                    light.g = setupLight.g;
                    light.b = setupLight.b;
                    dark.r = setupDark.r;
                    dark.g = setupDark.g;
                    dark.b = setupDark.b;
                    return;
                case MixBlend.first:
                    light.r += (setupLight.r - light.r) * alpha;
                    light.g += (setupLight.g - light.g) * alpha;
                    light.b += (setupLight.b - light.b) * alpha;
                    dark.r += (setupDark.r - dark.r) * alpha;
                    dark.g += (setupDark.g - dark.g) * alpha;
                    dark.b += (setupDark.b - dark.b) * alpha;
            }
            return;
        }
        let r = 0, g = 0, b = 0, a = 0, r2 = 0, g2 = 0, b2 = 0;
        let i = Timeline.search(frames, time, 7 /*ENTRIES*/);
        let curveType = this.curves[i / 7 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                r2 = frames[i + 4 /*R2*/];
                g2 = frames[i + 5 /*G2*/];
                b2 = frames[i + 6 /*B2*/];
                let t = (time - before) / (frames[i + 7 /*ENTRIES*/] - before);
                r += (frames[i + 7 /*ENTRIES*/ + 1 /*R*/] - r) * t;
                g += (frames[i + 7 /*ENTRIES*/ + 2 /*G*/] - g) * t;
                b += (frames[i + 7 /*ENTRIES*/ + 3 /*B*/] - b) * t;
                r2 += (frames[i + 7 /*ENTRIES*/ + 4 /*R2*/] - r2) * t;
                g2 += (frames[i + 7 /*ENTRIES*/ + 5 /*G2*/] - g2) * t;
                b2 += (frames[i + 7 /*ENTRIES*/ + 6 /*B2*/] - b2) * t;
                break;
            case 1 /*STEPPED*/:
                r = frames[i + 1 /*R*/];
                g = frames[i + 2 /*G*/];
                b = frames[i + 3 /*B*/];
                r2 = frames[i + 4 /*R2*/];
                g2 = frames[i + 5 /*G2*/];
                b2 = frames[i + 6 /*B2*/];
                break;
            default:
                r = this.getBezierValue(time, i, 1 /*R*/, curveType - 2 /*BEZIER*/);
                g = this.getBezierValue(time, i, 2 /*G*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
                b = this.getBezierValue(time, i, 3 /*B*/, curveType + 18 /*BEZIER_SIZE*/ * 2 - 2 /*BEZIER*/);
                r2 = this.getBezierValue(time, i, 4 /*R2*/, curveType + 18 /*BEZIER_SIZE*/ * 3 - 2 /*BEZIER*/);
                g2 = this.getBezierValue(time, i, 5 /*G2*/, curveType + 18 /*BEZIER_SIZE*/ * 4 - 2 /*BEZIER*/);
                b2 = this.getBezierValue(time, i, 6 /*B2*/, curveType + 18 /*BEZIER_SIZE*/ * 5 - 2 /*BEZIER*/);
        }
        if (alpha == 1) {
            light.r = r;
            light.g = g;
            light.b = b;
            dark.r = r2;
            dark.g = g2;
            dark.b = b2;
        }
        else {
            if (blend == MixBlend.setup) {
                let setupLight = slot.data.color, setupDark = slot.data.darkColor;
                light.r = setupLight.r;
                light.g = setupLight.g;
                light.b = setupLight.b;
                dark.r = setupDark.r;
                dark.g = setupDark.g;
                dark.b = setupDark.b;
            }
            light.r += (r - light.r) * alpha;
            light.g += (g - light.g) * alpha;
            light.b += (b - light.b) * alpha;
            dark.r += (r2 - dark.r) * alpha;
            dark.g += (g2 - dark.g) * alpha;
            dark.b += (b2 - dark.b) * alpha;
        }
    }
}
/** Changes a slot's {@link Slot#attachment}. */
export class AttachmentTimeline extends Timeline {
    slotIndex = 0;
    /** The attachment name for each key frame. May contain null values to clear the attachment. */
    attachmentNames;
    constructor(frameCount, slotIndex) {
        super(frameCount, [
            Property.attachment + "|" + slotIndex
        ]);
        this.slotIndex = slotIndex;
        this.attachmentNames = new Array(frameCount);
    }
    getFrameCount() {
        return this.frames.length;
    }
    /** Sets the time in seconds and the attachment name for the specified key frame. */
    setFrame(frame, time, attachmentName) {
        this.frames[frame] = time;
        this.attachmentNames[frame] = attachmentName;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        if (direction == MixDirection.mixOut) {
            if (blend == MixBlend.setup)
                this.setAttachment(skeleton, slot, slot.data.attachmentName);
            return;
        }
        if (time < this.frames[0]) {
            if (blend == MixBlend.setup || blend == MixBlend.first)
                this.setAttachment(skeleton, slot, slot.data.attachmentName);
            return;
        }
        this.setAttachment(skeleton, slot, this.attachmentNames[Timeline.search1(this.frames, time)]);
    }
    setAttachment(skeleton, slot, attachmentName) {
        slot.setAttachment(!attachmentName ? null : skeleton.getAttachment(this.slotIndex, attachmentName));
    }
}
/** Changes a slot's {@link Slot#deform} to deform a {@link VertexAttachment}. */
export class DeformTimeline extends CurveTimeline {
    slotIndex = 0;
    /** The attachment that will be deformed. */
    attachment;
    /** The vertices for each key frame. */
    vertices;
    constructor(frameCount, bezierCount, slotIndex, attachment) {
        super(frameCount, bezierCount, [
            Property.deform + "|" + slotIndex + "|" + attachment.id
        ]);
        this.slotIndex = slotIndex;
        this.attachment = attachment;
        this.vertices = new Array(frameCount);
    }
    getFrameCount() {
        return this.frames.length;
    }
    /** Sets the time in seconds and the vertices for the specified key frame.
     * @param vertices Vertex positions for an unweighted VertexAttachment, or deform offsets if it has weights. */
    setFrame(frame, time, vertices) {
        this.frames[frame] = time;
        this.vertices[frame] = vertices;
    }
    /** @param value1 Ignored (0 is used for a deform timeline).
     * @param value2 Ignored (1 is used for a deform timeline). */
    setBezier(bezier, frame, value, time1, value1, cx1, cy1, cx2, cy2, time2, value2) {
        let curves = this.curves;
        let i = this.getFrameCount() + bezier * 18 /*BEZIER_SIZE*/;
        if (value == 0)
            curves[frame] = 2 /*BEZIER*/ + i;
        let tmpx = (time1 - cx1 * 2 + cx2) * 0.03, tmpy = cy2 * 0.03 - cy1 * 0.06;
        let dddx = ((cx1 - cx2) * 3 - time1 + time2) * 0.006, dddy = (cy1 - cy2 + 0.33333333) * 0.018;
        let ddx = tmpx * 2 + dddx, ddy = tmpy * 2 + dddy;
        let dx = (cx1 - time1) * 0.3 + tmpx + dddx * 0.16666667, dy = cy1 * 0.3 + tmpy + dddy * 0.16666667;
        let x = time1 + dx, y = dy;
        for (let n = i + 18 /*BEZIER_SIZE*/; i < n; i += 2) {
            curves[i] = x;
            curves[i + 1] = y;
            dx += ddx;
            dy += ddy;
            ddx += dddx;
            ddy += dddy;
            x += dx;
            y += dy;
        }
    }
    getCurvePercent(time, frame) {
        let curves = this.curves;
        let i = curves[frame];
        switch (i) {
            case 0 /*LINEAR*/:
                let x = this.frames[frame];
                return (time - x) / (this.frames[frame + this.getFrameEntries()] - x);
            case 1 /*STEPPED*/:
                return 0;
        }
        i -= 2 /*BEZIER*/;
        if (curves[i] > time) {
            let x = this.frames[frame];
            return curves[i + 1] * (time - x) / (curves[i] - x);
        }
        let n = i + 18 /*BEZIER_SIZE*/;
        for (i += 2; i < n; i += 2) {
            if (curves[i] >= time) {
                let x = curves[i - 2], y = curves[i - 1];
                return y + (time - x) / (curves[i] - x) * (curves[i + 1] - y);
            }
        }
        let x = curves[n - 2], y = curves[n - 1];
        return y + (1 - y) * (time - x) / (this.frames[frame + this.getFrameEntries()] - x);
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let slotAttachment = slot.getAttachment();
        if (!slotAttachment)
            return;
        if (!(slotAttachment instanceof VertexAttachment) || slotAttachment.timelineAttachment != this.attachment)
            return;
        let deform = slot.deform;
        if (deform.length == 0)
            blend = MixBlend.setup;
        let vertices = this.vertices;
        let vertexCount = vertices[0].length;
        let frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    deform.length = 0;
                    return;
                case MixBlend.first:
                    if (alpha == 1) {
                        deform.length = 0;
                        return;
                    }
                    deform.length = vertexCount;
                    let vertexAttachment = slotAttachment;
                    if (!vertexAttachment.bones) {
                        // Unweighted vertex positions.
                        let setupVertices = vertexAttachment.vertices;
                        for (var i = 0; i < vertexCount; i++)
                            deform[i] += (setupVertices[i] - deform[i]) * alpha;
                    }
                    else {
                        // Weighted deform offsets.
                        alpha = 1 - alpha;
                        for (var i = 0; i < vertexCount; i++)
                            deform[i] *= alpha;
                    }
            }
            return;
        }
        deform.length = vertexCount;
        if (time >= frames[frames.length - 1]) {
            let lastVertices = vertices[frames.length - 1];
            if (alpha == 1) {
                if (blend == MixBlend.add) {
                    let vertexAttachment = slotAttachment;
                    if (!vertexAttachment.bones) {
                        // Unweighted vertex positions, with alpha.
                        let setupVertices = vertexAttachment.vertices;
                        for (let i = 0; i < vertexCount; i++)
                            deform[i] += lastVertices[i] - setupVertices[i];
                    }
                    else {
                        // Weighted deform offsets, with alpha.
                        for (let i = 0; i < vertexCount; i++)
                            deform[i] += lastVertices[i];
                    }
                }
                else
                    Utils.arrayCopy(lastVertices, 0, deform, 0, vertexCount);
            }
            else {
                switch (blend) {
                    case MixBlend.setup: {
                        let vertexAttachment = slotAttachment;
                        if (!vertexAttachment.bones) {
                            // Unweighted vertex positions, with alpha.
                            let setupVertices = vertexAttachment.vertices;
                            for (let i = 0; i < vertexCount; i++) {
                                let setup = setupVertices[i];
                                deform[i] = setup + (lastVertices[i] - setup) * alpha;
                            }
                        }
                        else {
                            // Weighted deform offsets, with alpha.
                            for (let i = 0; i < vertexCount; i++)
                                deform[i] = lastVertices[i] * alpha;
                        }
                        break;
                    }
                    case MixBlend.first:
                    case MixBlend.replace:
                        for (let i = 0; i < vertexCount; i++)
                            deform[i] += (lastVertices[i] - deform[i]) * alpha;
                        break;
                    case MixBlend.add:
                        let vertexAttachment = slotAttachment;
                        if (!vertexAttachment.bones) {
                            // Unweighted vertex positions, with alpha.
                            let setupVertices = vertexAttachment.vertices;
                            for (let i = 0; i < vertexCount; i++)
                                deform[i] += (lastVertices[i] - setupVertices[i]) * alpha;
                        }
                        else {
                            // Weighted deform offsets, with alpha.
                            for (let i = 0; i < vertexCount; i++)
                                deform[i] += lastVertices[i] * alpha;
                        }
                }
            }
            return;
        }
        // Interpolate between the previous frame and the current frame.
        let frame = Timeline.search1(frames, time);
        let percent = this.getCurvePercent(time, frame);
        let prevVertices = vertices[frame];
        let nextVertices = vertices[frame + 1];
        if (alpha == 1) {
            if (blend == MixBlend.add) {
                let vertexAttachment = slotAttachment;
                if (!vertexAttachment.bones) {
                    // Unweighted vertex positions, with alpha.
                    let setupVertices = vertexAttachment.vertices;
                    for (let i = 0; i < vertexCount; i++) {
                        let prev = prevVertices[i];
                        deform[i] += prev + (nextVertices[i] - prev) * percent - setupVertices[i];
                    }
                }
                else {
                    // Weighted deform offsets, with alpha.
                    for (let i = 0; i < vertexCount; i++) {
                        let prev = prevVertices[i];
                        deform[i] += prev + (nextVertices[i] - prev) * percent;
                    }
                }
            }
            else {
                for (let i = 0; i < vertexCount; i++) {
                    let prev = prevVertices[i];
                    deform[i] = prev + (nextVertices[i] - prev) * percent;
                }
            }
        }
        else {
            switch (blend) {
                case MixBlend.setup: {
                    let vertexAttachment = slotAttachment;
                    if (!vertexAttachment.bones) {
                        // Unweighted vertex positions, with alpha.
                        let setupVertices = vertexAttachment.vertices;
                        for (let i = 0; i < vertexCount; i++) {
                            let prev = prevVertices[i], setup = setupVertices[i];
                            deform[i] = setup + (prev + (nextVertices[i] - prev) * percent - setup) * alpha;
                        }
                    }
                    else {
                        // Weighted deform offsets, with alpha.
                        for (let i = 0; i < vertexCount; i++) {
                            let prev = prevVertices[i];
                            deform[i] = (prev + (nextVertices[i] - prev) * percent) * alpha;
                        }
                    }
                    break;
                }
                case MixBlend.first:
                case MixBlend.replace:
                    for (let i = 0; i < vertexCount; i++) {
                        let prev = prevVertices[i];
                        deform[i] += (prev + (nextVertices[i] - prev) * percent - deform[i]) * alpha;
                    }
                    break;
                case MixBlend.add:
                    let vertexAttachment = slotAttachment;
                    if (!vertexAttachment.bones) {
                        // Unweighted vertex positions, with alpha.
                        let setupVertices = vertexAttachment.vertices;
                        for (let i = 0; i < vertexCount; i++) {
                            let prev = prevVertices[i];
                            deform[i] += (prev + (nextVertices[i] - prev) * percent - setupVertices[i]) * alpha;
                        }
                    }
                    else {
                        // Weighted deform offsets, with alpha.
                        for (let i = 0; i < vertexCount; i++) {
                            let prev = prevVertices[i];
                            deform[i] += (prev + (nextVertices[i] - prev) * percent) * alpha;
                        }
                    }
            }
        }
    }
}
/** Fires an {@link Event} when specific animation times are reached. */
export class EventTimeline extends Timeline {
    static propertyIds = ["" + Property.event];
    /** The event for each key frame. */
    events;
    constructor(frameCount) {
        super(frameCount, EventTimeline.propertyIds);
        this.events = new Array(frameCount);
    }
    getFrameCount() {
        return this.frames.length;
    }
    /** Sets the time in seconds and the event for the specified key frame. */
    setFrame(frame, event) {
        this.frames[frame] = event.time;
        this.events[frame] = event;
    }
    /** Fires events for frames > `lastTime` and <= `time`. */
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        if (!firedEvents)
            return;
        let frames = this.frames;
        let frameCount = this.frames.length;
        if (lastTime > time) { // Apply after lastTime for looped animations.
            this.apply(skeleton, lastTime, Number.MAX_VALUE, firedEvents, alpha, blend, direction);
            lastTime = -1;
        }
        else if (lastTime >= frames[frameCount - 1]) // Last time is after last frame.
            return;
        if (time < frames[0])
            return;
        let i = 0;
        if (lastTime < frames[0])
            i = 0;
        else {
            i = Timeline.search1(frames, lastTime) + 1;
            let frameTime = frames[i];
            while (i > 0) { // Fire multiple events with the same frame.
                if (frames[i - 1] != frameTime)
                    break;
                i--;
            }
        }
        for (; i < frameCount && time >= frames[i]; i++)
            firedEvents.push(this.events[i]);
    }
}
/** Changes a skeleton's {@link Skeleton#drawOrder}. */
export class DrawOrderTimeline extends Timeline {
    static propertyIds = ["" + Property.drawOrder];
    /** The draw order for each key frame. See {@link #setFrame(int, float, int[])}. */
    drawOrders;
    constructor(frameCount) {
        super(frameCount, DrawOrderTimeline.propertyIds);
        this.drawOrders = new Array(frameCount);
    }
    getFrameCount() {
        return this.frames.length;
    }
    /** Sets the time in seconds and the draw order for the specified key frame.
     * @param drawOrder For each slot in {@link Skeleton#slots}, the index of the new draw order. May be null to use setup pose
     *           draw order. */
    setFrame(frame, time, drawOrder) {
        this.frames[frame] = time;
        this.drawOrders[frame] = drawOrder;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        if (direction == MixDirection.mixOut) {
            if (blend == MixBlend.setup)
                Utils.arrayCopy(skeleton.slots, 0, skeleton.drawOrder, 0, skeleton.slots.length);
            return;
        }
        if (time < this.frames[0]) {
            if (blend == MixBlend.setup || blend == MixBlend.first)
                Utils.arrayCopy(skeleton.slots, 0, skeleton.drawOrder, 0, skeleton.slots.length);
            return;
        }
        let idx = Timeline.search1(this.frames, time);
        let drawOrderToSetupIndex = this.drawOrders[idx];
        if (!drawOrderToSetupIndex)
            Utils.arrayCopy(skeleton.slots, 0, skeleton.drawOrder, 0, skeleton.slots.length);
        else {
            let drawOrder = skeleton.drawOrder;
            let slots = skeleton.slots;
            for (let i = 0, n = drawOrderToSetupIndex.length; i < n; i++)
                drawOrder[i] = slots[drawOrderToSetupIndex[i]];
        }
    }
}
/** Changes an IK constraint's {@link IkConstraint#mix}, {@link IkConstraint#softness},
 * {@link IkConstraint#bendDirection}, {@link IkConstraint#stretch}, and {@link IkConstraint#compress}. */
export class IkConstraintTimeline extends CurveTimeline {
    /** The index of the IK constraint in {@link Skeleton#getIkConstraints()} that will be changed when this timeline is applied */
    constraintIndex = 0;
    constructor(frameCount, bezierCount, ikConstraintIndex) {
        super(frameCount, bezierCount, [
            Property.ikConstraint + "|" + ikConstraintIndex
        ]);
        this.constraintIndex = ikConstraintIndex;
    }
    getFrameEntries() {
        return 6 /*ENTRIES*/;
    }
    /** Sets the time in seconds, mix, softness, bend direction, compress, and stretch for the specified key frame. */
    setFrame(frame, time, mix, softness, bendDirection, compress, stretch) {
        frame *= 6 /*ENTRIES*/;
        this.frames[frame] = time;
        this.frames[frame + 1 /*MIX*/] = mix;
        this.frames[frame + 2 /*SOFTNESS*/] = softness;
        this.frames[frame + 3 /*BEND_DIRECTION*/] = bendDirection;
        this.frames[frame + 4 /*COMPRESS*/] = compress ? 1 : 0;
        this.frames[frame + 5 /*STRETCH*/] = stretch ? 1 : 0;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint = skeleton.ikConstraints[this.constraintIndex];
        if (!constraint.active)
            return;
        let frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    constraint.mix = constraint.data.mix;
                    constraint.softness = constraint.data.softness;
                    constraint.bendDirection = constraint.data.bendDirection;
                    constraint.compress = constraint.data.compress;
                    constraint.stretch = constraint.data.stretch;
                    return;
                case MixBlend.first:
                    constraint.mix += (constraint.data.mix - constraint.mix) * alpha;
                    constraint.softness += (constraint.data.softness - constraint.softness) * alpha;
                    constraint.bendDirection = constraint.data.bendDirection;
                    constraint.compress = constraint.data.compress;
                    constraint.stretch = constraint.data.stretch;
            }
            return;
        }
        let mix = 0, softness = 0;
        let i = Timeline.search(frames, time, 6 /*ENTRIES*/);
        let curveType = this.curves[i / 6 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                mix = frames[i + 1 /*MIX*/];
                softness = frames[i + 2 /*SOFTNESS*/];
                let t = (time - before) / (frames[i + 6 /*ENTRIES*/] - before);
                mix += (frames[i + 6 /*ENTRIES*/ + 1 /*MIX*/] - mix) * t;
                softness += (frames[i + 6 /*ENTRIES*/ + 2 /*SOFTNESS*/] - softness) * t;
                break;
            case 1 /*STEPPED*/:
                mix = frames[i + 1 /*MIX*/];
                softness = frames[i + 2 /*SOFTNESS*/];
                break;
            default:
                mix = this.getBezierValue(time, i, 1 /*MIX*/, curveType - 2 /*BEZIER*/);
                softness = this.getBezierValue(time, i, 2 /*SOFTNESS*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
        }
        if (blend == MixBlend.setup) {
            constraint.mix = constraint.data.mix + (mix - constraint.data.mix) * alpha;
            constraint.softness = constraint.data.softness + (softness - constraint.data.softness) * alpha;
            if (direction == MixDirection.mixOut) {
                constraint.bendDirection = constraint.data.bendDirection;
                constraint.compress = constraint.data.compress;
                constraint.stretch = constraint.data.stretch;
            }
            else {
                constraint.bendDirection = frames[i + 3 /*BEND_DIRECTION*/];
                constraint.compress = frames[i + 4 /*COMPRESS*/] != 0;
                constraint.stretch = frames[i + 5 /*STRETCH*/] != 0;
            }
        }
        else {
            constraint.mix += (mix - constraint.mix) * alpha;
            constraint.softness += (softness - constraint.softness) * alpha;
            if (direction == MixDirection.mixIn) {
                constraint.bendDirection = frames[i + 3 /*BEND_DIRECTION*/];
                constraint.compress = frames[i + 4 /*COMPRESS*/] != 0;
                constraint.stretch = frames[i + 5 /*STRETCH*/] != 0;
            }
        }
    }
}
/** Changes a transform constraint's {@link TransformConstraint#rotateMix}, {@link TransformConstraint#translateMix},
 * {@link TransformConstraint#scaleMix}, and {@link TransformConstraint#shearMix}. */
export class TransformConstraintTimeline extends CurveTimeline {
    /** The index of the transform constraint slot in {@link Skeleton#transformConstraints} that will be changed. */
    constraintIndex = 0;
    constructor(frameCount, bezierCount, transformConstraintIndex) {
        super(frameCount, bezierCount, [
            Property.transformConstraint + "|" + transformConstraintIndex
        ]);
        this.constraintIndex = transformConstraintIndex;
    }
    getFrameEntries() {
        return 7 /*ENTRIES*/;
    }
    /** The time in seconds, rotate mix, translate mix, scale mix, and shear mix for the specified key frame. */
    setFrame(frame, time, mixRotate, mixX, mixY, mixScaleX, mixScaleY, mixShearY) {
        let frames = this.frames;
        frame *= 7 /*ENTRIES*/;
        frames[frame] = time;
        frames[frame + 1 /*ROTATE*/] = mixRotate;
        frames[frame + 2 /*X*/] = mixX;
        frames[frame + 3 /*Y*/] = mixY;
        frames[frame + 4 /*SCALEX*/] = mixScaleX;
        frames[frame + 5 /*SCALEY*/] = mixScaleY;
        frames[frame + 6 /*SHEARY*/] = mixShearY;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint = skeleton.transformConstraints[this.constraintIndex];
        if (!constraint.active)
            return;
        let frames = this.frames;
        if (time < frames[0]) {
            let data = constraint.data;
            switch (blend) {
                case MixBlend.setup:
                    constraint.mixRotate = data.mixRotate;
                    constraint.mixX = data.mixX;
                    constraint.mixY = data.mixY;
                    constraint.mixScaleX = data.mixScaleX;
                    constraint.mixScaleY = data.mixScaleY;
                    constraint.mixShearY = data.mixShearY;
                    return;
                case MixBlend.first:
                    constraint.mixRotate += (data.mixRotate - constraint.mixRotate) * alpha;
                    constraint.mixX += (data.mixX - constraint.mixX) * alpha;
                    constraint.mixY += (data.mixY - constraint.mixY) * alpha;
                    constraint.mixScaleX += (data.mixScaleX - constraint.mixScaleX) * alpha;
                    constraint.mixScaleY += (data.mixScaleY - constraint.mixScaleY) * alpha;
                    constraint.mixShearY += (data.mixShearY - constraint.mixShearY) * alpha;
            }
            return;
        }
        let rotate, x, y, scaleX, scaleY, shearY;
        let i = Timeline.search(frames, time, 7 /*ENTRIES*/);
        let curveType = this.curves[i / 7 /*ENTRIES*/];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                rotate = frames[i + 1 /*ROTATE*/];
                x = frames[i + 2 /*X*/];
                y = frames[i + 3 /*Y*/];
                scaleX = frames[i + 4 /*SCALEX*/];
                scaleY = frames[i + 5 /*SCALEY*/];
                shearY = frames[i + 6 /*SHEARY*/];
                let t = (time - before) / (frames[i + 7 /*ENTRIES*/] - before);
                rotate += (frames[i + 7 /*ENTRIES*/ + 1 /*ROTATE*/] - rotate) * t;
                x += (frames[i + 7 /*ENTRIES*/ + 2 /*X*/] - x) * t;
                y += (frames[i + 7 /*ENTRIES*/ + 3 /*Y*/] - y) * t;
                scaleX += (frames[i + 7 /*ENTRIES*/ + 4 /*SCALEX*/] - scaleX) * t;
                scaleY += (frames[i + 7 /*ENTRIES*/ + 5 /*SCALEY*/] - scaleY) * t;
                shearY += (frames[i + 7 /*ENTRIES*/ + 6 /*SHEARY*/] - shearY) * t;
                break;
            case 1 /*STEPPED*/:
                rotate = frames[i + 1 /*ROTATE*/];
                x = frames[i + 2 /*X*/];
                y = frames[i + 3 /*Y*/];
                scaleX = frames[i + 4 /*SCALEX*/];
                scaleY = frames[i + 5 /*SCALEY*/];
                shearY = frames[i + 6 /*SHEARY*/];
                break;
            default:
                rotate = this.getBezierValue(time, i, 1 /*ROTATE*/, curveType - 2 /*BEZIER*/);
                x = this.getBezierValue(time, i, 2 /*X*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
                y = this.getBezierValue(time, i, 3 /*Y*/, curveType + 18 /*BEZIER_SIZE*/ * 2 - 2 /*BEZIER*/);
                scaleX = this.getBezierValue(time, i, 4 /*SCALEX*/, curveType + 18 /*BEZIER_SIZE*/ * 3 - 2 /*BEZIER*/);
                scaleY = this.getBezierValue(time, i, 5 /*SCALEY*/, curveType + 18 /*BEZIER_SIZE*/ * 4 - 2 /*BEZIER*/);
                shearY = this.getBezierValue(time, i, 6 /*SHEARY*/, curveType + 18 /*BEZIER_SIZE*/ * 5 - 2 /*BEZIER*/);
        }
        if (blend == MixBlend.setup) {
            let data = constraint.data;
            constraint.mixRotate = data.mixRotate + (rotate - data.mixRotate) * alpha;
            constraint.mixX = data.mixX + (x - data.mixX) * alpha;
            constraint.mixY = data.mixY + (y - data.mixY) * alpha;
            constraint.mixScaleX = data.mixScaleX + (scaleX - data.mixScaleX) * alpha;
            constraint.mixScaleY = data.mixScaleY + (scaleY - data.mixScaleY) * alpha;
            constraint.mixShearY = data.mixShearY + (shearY - data.mixShearY) * alpha;
        }
        else {
            constraint.mixRotate += (rotate - constraint.mixRotate) * alpha;
            constraint.mixX += (x - constraint.mixX) * alpha;
            constraint.mixY += (y - constraint.mixY) * alpha;
            constraint.mixScaleX += (scaleX - constraint.mixScaleX) * alpha;
            constraint.mixScaleY += (scaleY - constraint.mixScaleY) * alpha;
            constraint.mixShearY += (shearY - constraint.mixShearY) * alpha;
        }
    }
}
/** Changes a path constraint's {@link PathConstraint#position}. */
export class PathConstraintPositionTimeline extends CurveTimeline1 {
    /** The index of the path constraint in {@link Skeleton#getPathConstraints()} that will be changed when this timeline is
     * applied. */
    constraintIndex = 0;
    constructor(frameCount, bezierCount, pathConstraintIndex) {
        super(frameCount, bezierCount, Property.pathConstraintPosition + "|" + pathConstraintIndex);
        this.constraintIndex = pathConstraintIndex;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint = skeleton.pathConstraints[this.constraintIndex];
        if (constraint.active)
            constraint.position = this.getAbsoluteValue(time, alpha, blend, constraint.position, constraint.data.position);
    }
}
/** Changes a path constraint's {@link PathConstraint#spacing}. */
export class PathConstraintSpacingTimeline extends CurveTimeline1 {
    /** The index of the path constraint in {@link Skeleton#getPathConstraints()} that will be changed when this timeline is
     * applied. */
    constraintIndex = 0;
    constructor(frameCount, bezierCount, pathConstraintIndex) {
        super(frameCount, bezierCount, Property.pathConstraintSpacing + "|" + pathConstraintIndex);
        this.constraintIndex = pathConstraintIndex;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint = skeleton.pathConstraints[this.constraintIndex];
        if (constraint.active)
            constraint.spacing = this.getAbsoluteValue(time, alpha, blend, constraint.spacing, constraint.data.spacing);
    }
}
/** Changes a transform constraint's {@link PathConstraint#getMixRotate()}, {@link PathConstraint#getMixX()}, and
 * {@link PathConstraint#getMixY()}. */
export class PathConstraintMixTimeline extends CurveTimeline {
    /** The index of the path constraint in {@link Skeleton#getPathConstraints()} that will be changed when this timeline is
     * applied. */
    constraintIndex = 0;
    constructor(frameCount, bezierCount, pathConstraintIndex) {
        super(frameCount, bezierCount, [
            Property.pathConstraintMix + "|" + pathConstraintIndex
        ]);
        this.constraintIndex = pathConstraintIndex;
    }
    getFrameEntries() {
        return 4 /*ENTRIES*/;
    }
    setFrame(frame, time, mixRotate, mixX, mixY) {
        let frames = this.frames;
        frame <<= 2;
        frames[frame] = time;
        frames[frame + 1 /*ROTATE*/] = mixRotate;
        frames[frame + 2 /*X*/] = mixX;
        frames[frame + 3 /*Y*/] = mixY;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint = skeleton.pathConstraints[this.constraintIndex];
        if (!constraint.active)
            return;
        let frames = this.frames;
        if (time < frames[0]) {
            switch (blend) {
                case MixBlend.setup:
                    constraint.mixRotate = constraint.data.mixRotate;
                    constraint.mixX = constraint.data.mixX;
                    constraint.mixY = constraint.data.mixY;
                    return;
                case MixBlend.first:
                    constraint.mixRotate += (constraint.data.mixRotate - constraint.mixRotate) * alpha;
                    constraint.mixX += (constraint.data.mixX - constraint.mixX) * alpha;
                    constraint.mixY += (constraint.data.mixY - constraint.mixY) * alpha;
            }
            return;
        }
        let rotate, x, y;
        let i = Timeline.search(frames, time, 4 /*ENTRIES*/);
        let curveType = this.curves[i >> 2];
        switch (curveType) {
            case 0 /*LINEAR*/:
                let before = frames[i];
                rotate = frames[i + 1 /*ROTATE*/];
                x = frames[i + 2 /*X*/];
                y = frames[i + 3 /*Y*/];
                let t = (time - before) / (frames[i + 4 /*ENTRIES*/] - before);
                rotate += (frames[i + 4 /*ENTRIES*/ + 1 /*ROTATE*/] - rotate) * t;
                x += (frames[i + 4 /*ENTRIES*/ + 2 /*X*/] - x) * t;
                y += (frames[i + 4 /*ENTRIES*/ + 3 /*Y*/] - y) * t;
                break;
            case 1 /*STEPPED*/:
                rotate = frames[i + 1 /*ROTATE*/];
                x = frames[i + 2 /*X*/];
                y = frames[i + 3 /*Y*/];
                break;
            default:
                rotate = this.getBezierValue(time, i, 1 /*ROTATE*/, curveType - 2 /*BEZIER*/);
                x = this.getBezierValue(time, i, 2 /*X*/, curveType + 18 /*BEZIER_SIZE*/ - 2 /*BEZIER*/);
                y = this.getBezierValue(time, i, 3 /*Y*/, curveType + 18 /*BEZIER_SIZE*/ * 2 - 2 /*BEZIER*/);
        }
        if (blend == MixBlend.setup) {
            let data = constraint.data;
            constraint.mixRotate = data.mixRotate + (rotate - data.mixRotate) * alpha;
            constraint.mixX = data.mixX + (x - data.mixX) * alpha;
            constraint.mixY = data.mixY + (y - data.mixY) * alpha;
        }
        else {
            constraint.mixRotate += (rotate - constraint.mixRotate) * alpha;
            constraint.mixX += (x - constraint.mixX) * alpha;
            constraint.mixY += (y - constraint.mixY) * alpha;
        }
    }
}
/** The base class for most {@link PhysicsConstraint} timelines. */
export class PhysicsConstraintTimeline extends CurveTimeline1 {
    /** The index of the physics constraint in {@link Skeleton#getPhysicsConstraints()} that will be changed when this timeline
     * is applied, or -1 if all physics constraints in the skeleton will be changed. */
    constraintIndex = 0;
    /** @param physicsConstraintIndex -1 for all physics constraints in the skeleton. */
    constructor(frameCount, bezierCount, physicsConstraintIndex, property) {
        super(frameCount, bezierCount, property + "|" + physicsConstraintIndex);
        this.constraintIndex = physicsConstraintIndex;
    }
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint;
        if (this.constraintIndex == -1) {
            const value = time >= this.frames[0] ? this.getCurveValue(time) : 0;
            for (const constraint of skeleton.physicsConstraints) {
                if (constraint.active && this.global(constraint.data))
                    this.set(constraint, this.getAbsoluteValue2(time, alpha, blend, this.get(constraint), this.setup(constraint), value));
            }
        }
        else {
            constraint = skeleton.physicsConstraints[this.constraintIndex];
            if (constraint.active)
                this.set(constraint, this.getAbsoluteValue(time, alpha, blend, this.get(constraint), this.setup(constraint)));
        }
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getInertia()}. */
export class PhysicsConstraintInertiaTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintInertia);
    }
    setup(constraint) {
        return constraint.data.inertia;
    }
    get(constraint) {
        return constraint.inertia;
    }
    set(constraint, value) {
        constraint.inertia = value;
    }
    global(constraint) {
        return constraint.inertiaGlobal;
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getStrength()}. */
export class PhysicsConstraintStrengthTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintStrength);
    }
    setup(constraint) {
        return constraint.data.strength;
    }
    get(constraint) {
        return constraint.strength;
    }
    set(constraint, value) {
        constraint.strength = value;
    }
    global(constraint) {
        return constraint.strengthGlobal;
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getDamping()}. */
export class PhysicsConstraintDampingTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintDamping);
    }
    setup(constraint) {
        return constraint.data.damping;
    }
    get(constraint) {
        return constraint.damping;
    }
    set(constraint, value) {
        constraint.damping = value;
    }
    global(constraint) {
        return constraint.dampingGlobal;
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getMassInverse()}. The timeline values are not inverted. */
export class PhysicsConstraintMassTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintMass);
    }
    setup(constraint) {
        return 1 / constraint.data.massInverse;
    }
    get(constraint) {
        return 1 / constraint.massInverse;
    }
    set(constraint, value) {
        constraint.massInverse = 1 / value;
    }
    global(constraint) {
        return constraint.massGlobal;
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getWind()}. */
export class PhysicsConstraintWindTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintWind);
    }
    setup(constraint) {
        return constraint.data.wind;
    }
    get(constraint) {
        return constraint.wind;
    }
    set(constraint, value) {
        constraint.wind = value;
    }
    global(constraint) {
        return constraint.windGlobal;
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getGravity()}. */
export class PhysicsConstraintGravityTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintGravity);
    }
    setup(constraint) {
        return constraint.data.gravity;
    }
    get(constraint) {
        return constraint.gravity;
    }
    set(constraint, value) {
        constraint.gravity = value;
    }
    global(constraint) {
        return constraint.gravityGlobal;
    }
}
/** Changes a physics constraint's {@link PhysicsConstraint#getMix()}. */
export class PhysicsConstraintMixTimeline extends PhysicsConstraintTimeline {
    constructor(frameCount, bezierCount, physicsConstraintIndex) {
        super(frameCount, bezierCount, physicsConstraintIndex, Property.physicsConstraintMix);
    }
    setup(constraint) {
        return constraint.data.mix;
    }
    get(constraint) {
        return constraint.mix;
    }
    set(constraint, value) {
        constraint.mix = value;
    }
    global(constraint) {
        return constraint.mixGlobal;
    }
}
/** Resets a physics constraint when specific animation times are reached. */
export class PhysicsConstraintResetTimeline extends Timeline {
    static propertyIds = [Property.physicsConstraintReset.toString()];
    /** The index of the physics constraint in {@link Skeleton#getPhysicsConstraints()} that will be reset when this timeline is
    * applied, or -1 if all physics constraints in the skeleton will be reset. */
    constraintIndex;
    /** @param physicsConstraintIndex -1 for all physics constraints in the skeleton. */
    constructor(frameCount, physicsConstraintIndex) {
        super(frameCount, PhysicsConstraintResetTimeline.propertyIds);
        this.constraintIndex = physicsConstraintIndex;
    }
    getFrameCount() {
        return this.frames.length;
    }
    /** Sets the time for the specified frame.
     * @param frame Between 0 and <code>frameCount</code>, inclusive. */
    setFrame(frame, time) {
        this.frames[frame] = time;
    }
    /** Resets the physics constraint when frames > <code>lastTime</code> and <= <code>time</code>. */
    apply(skeleton, lastTime, time, firedEvents, alpha, blend, direction) {
        let constraint;
        if (this.constraintIndex != -1) {
            constraint = skeleton.physicsConstraints[this.constraintIndex];
            if (!constraint.active)
                return;
        }
        const frames = this.frames;
        if (lastTime > time) { // Apply after lastTime for looped animations.
            this.apply(skeleton, lastTime, Number.MAX_VALUE, [], alpha, blend, direction);
            lastTime = -1;
        }
        else if (lastTime >= frames[frames.length - 1]) // Last time is after last frame.
            return;
        if (time < frames[0])
            return;
        if (lastTime < frames[0] || time >= frames[Timeline.search1(frames, lastTime) + 1]) {
            if (constraint != null)
                constraint.reset();
            else {
                for (const constraint of skeleton.physicsConstraints) {
                    if (constraint.active)
                        constraint.reset();
                }
            }
        }
    }
}
/** Changes a slot's {@link Slot#getSequenceIndex()} for an attachment's {@link Sequence}. */
export class SequenceTimeline extends Timeline {
    static ENTRIES = 3;
    static MODE = 1;
    static DELAY = 2;
    slotIndex;
    attachment;
    constructor(frameCount, slotIndex, attachment) {
        super(frameCount, [
            Property.sequence + "|" + slotIndex + "|" + attachment.sequence.id
        ]);
        this.slotIndex = slotIndex;
        this.attachment = attachment;
    }
    getFrameEntries() {
        return SequenceTimeline.ENTRIES;
    }
    getSlotIndex() {
        return this.slotIndex;
    }
    getAttachment() {
        return this.attachment;
    }
    /** Sets the time, mode, index, and frame time for the specified frame.
     * @param frame Between 0 and <code>frameCount</code>, inclusive.
     * @param time Seconds between frames. */
    setFrame(frame, time, mode, index, delay) {
        let frames = this.frames;
        frame *= SequenceTimeline.ENTRIES;
        frames[frame] = time;
        frames[frame + SequenceTimeline.MODE] = mode | (index << 4);
        frames[frame + SequenceTimeline.DELAY] = delay;
    }
    apply(skeleton, lastTime, time, events, alpha, blend, direction) {
        let slot = skeleton.slots[this.slotIndex];
        if (!slot.bone.active)
            return;
        let slotAttachment = slot.attachment;
        let attachment = this.attachment;
        if (slotAttachment != attachment) {
            if (!(slotAttachment instanceof VertexAttachment)
                || slotAttachment.timelineAttachment != attachment)
                return;
        }
        let frames = this.frames;
        if (time < frames[0]) {
            if (blend == MixBlend.setup || blend == MixBlend.first)
                slot.sequenceIndex = -1;
            return;
        }
        let i = Timeline.search(frames, time, SequenceTimeline.ENTRIES);
        let before = frames[i];
        let modeAndIndex = frames[i + SequenceTimeline.MODE];
        let delay = frames[i + SequenceTimeline.DELAY];
        if (!this.attachment.sequence)
            return;
        let index = modeAndIndex >> 4, count = this.attachment.sequence.regions.length;
        let mode = SequenceModeValues[modeAndIndex & 0xf];
        if (mode != SequenceMode.hold) {
            index += (((time - before) / delay + 0.00001) | 0);
            switch (mode) {
                case SequenceMode.once:
                    index = Math.min(count - 1, index);
                    break;
                case SequenceMode.loop:
                    index %= count;
                    break;
                case SequenceMode.pingpong: {
                    let n = (count << 1) - 2;
                    index = n == 0 ? 0 : index % n;
                    if (index >= count)
                        index = n - index;
                    break;
                }
                case SequenceMode.onceReverse:
                    index = Math.max(count - 1 - index, 0);
                    break;
                case SequenceMode.loopReverse:
                    index = count - 1 - (index % count);
                    break;
                case SequenceMode.pingpongReverse: {
                    let n = (count << 1) - 2;
                    index = n == 0 ? 0 : (index + count - 1) % n;
                    if (index >= count)
                        index = n - index;
                }
            }
        }
        slot.sequenceIndex = index;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQW5pbWF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0FuaW1hdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OytFQTJCK0U7QUFFL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFjLE1BQU0sNkJBQTZCLENBQUM7QUFNM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFtQixNQUFNLFlBQVksQ0FBQztBQUcxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFLN0UsNkRBQTZEO0FBQzdELE1BQU0sT0FBTyxTQUFTO0lBQ3JCLG1GQUFtRjtJQUNuRixJQUFJLENBQVM7SUFDYixTQUFTLEdBQW9CLEVBQUUsQ0FBQztJQUNoQyxXQUFXLEdBQWMsSUFBSSxTQUFTLEVBQUUsQ0FBQztJQUV6Qyx1R0FBdUc7SUFDdkcsUUFBUSxDQUFTO0lBRWpCLFlBQWEsSUFBWSxFQUFFLFNBQTBCLEVBQUUsUUFBZ0I7UUFDdEUsSUFBSSxDQUFDLElBQUk7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUMxQixDQUFDO0lBRUQsWUFBWSxDQUFFLFNBQTBCO1FBQ3ZDLElBQUksQ0FBQyxTQUFTO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMs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LE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxXQUFXLENBQUMsQ0FBQztZQUMzRSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUEsZUFBZSxDQUFDO1FBQzlCLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM1QixJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDekMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQy9ELENBQUM7UUFDRixDQUFDO1FBQ0QsVUFBVSxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNyQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FB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LENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBLFdBQVcsR0FBRyxDQUFDLENBQUEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNqRCxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxXQUFXLEdBQUcsQ0FBQyxDQUFBLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUEsV0FBVyxHQUFHLENBQUMsQ0FBQSxVQUFVLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2hFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBLFdBQVcsR0FBRyxDQUFDLENBQUEsVUFBVSxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNoRSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxXQUFXLEdBQUcsQ0FBQyxDQUFBLFVBQVUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDaEUsTUFBTTtZQUNQLEtBQUssQ0FBQyxDQUFBLFdBQVc7Z0JBQ2hCLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxVQUFVLENBQUMsQ0FBQztnQkFDakMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBLEtBQUssQ0FBQyxDQUFDO2dCQUN2QixDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUEsS0FBSyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxVQUFVLENBQUMsQ0FBQztnQkFDakMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBLFVBQVUsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUEsVUFBVSxDQUFDLENBQUM7Z0JBQ2pDLE1BQU07WUFDUDtnQkFDQyxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQSxVQUFVLEVBQUUsU0FBUyxHQUFHLENBQUMsQ0FBQSxVQUFVLENBQUMsQ0FBQztnQkFDNUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUEsS0FBSyxFQUFFLFNBQVMsR0FBRyxFQUFFLENBQUEsZUFBZSxHQUFHLENBQUMsQ0FBQSxVQUFVLENBQUMsQ0FBQztnQkFDdEYsQ0FBQyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUEsS0FBSyxFQUFFLFNBQVMsR0FBRyxFQUFFLENBQUEsZUFBZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUEsVUFBVSxDQUFDLENBQUM7Z0JBQzFGLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFBLFVBQVUsRUFBRSxTQUFTLEdBQUcsRUFBRSxDQUFBLGVBQWUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFBLFVBQVUsQ0FBQyxDQUFDO2dCQUNwRyxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQSxVQUFVLEVBQUUsU0FBUyxHQUFHLEVBQUUsQ0FBQSxlQUFlLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQSxVQUFVLENBQUMsQ0FBQztnQkFDcEcsTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUEsVUFBVSxFQUFFLFNBQVMsR0FBRyxFQUFFLENBQUEsZUFBZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUEsVUFBVSxDQUFDLENBQUM7UUFDdEcsQ0FBQztRQUVELElBQUksS0FBSyxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM3QixJQUFJLElBQUksR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDO1lBQzNCLFVBQVUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQzFFLFVBQVUsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3RELFVBQVUsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3RELFVBQVUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQzFFLFVBQVUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQzFFLFVBQVUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQzNFLENBQUM7YUFBTSxDQUFDO1lBQ1AsVUFBVSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ2hFLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUNqRCxVQUFVLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FB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b0JBQzVCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDekIsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztvQkFDL0IsSUFBSSxLQUFLLElBQUksS0FBSzt3QkFBRSxLQUFLLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztvQkFDdEMsTUFBTTtnQkFDUCxDQUFDO2dCQUNELEtBQUssWUFBWSxDQUFDLFdBQVc7b0JBQzVCLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUN2QyxNQUFNO2dCQUNQLEtBQUssWUFBWSxDQUFDLFdBQVc7b0JBQzVCLEtBQUssR0FBRyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDO29CQUNwQyxNQUFNO2dCQUNQLEtBQUssWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7b0JBQ25DLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDekIsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDN0MsSUFBSSxLQUFLLElBQUksS0FBSzt3QkFBRSxLQUFLLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztnQkFDdkMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7SUFDNUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAqIFNwaW5lIFJ1bnRpbWVzIExpY2Vuc2UgQWdyZWVtZW50XG4gKiBMYXN0IHVwZGF0ZWQgSnVseSAyOCwgMjAyMy4gUmVwbGFjZXMgYWxsIHByaW9yIHZlcnNpb25zLlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMy0yMDIzLCBFc290ZXJpYyBTb2Z0d2FyZSBMTENcbiAqXG4gKiBJbnRlZ3JhdGlvbiBvZiB0aGUgU3BpbmUgUnVudGltZXMgaW50byBzb2Z0d2FyZSBvciBvdGhlcndpc2UgY3JlYXRpbmdcbiAqIGRlcml2YXRpdmUgd29ya3Mgb2YgdGhlIFNwaW5lIFJ1bnRpbWVzIGlzIHBlcm1pdHRlZCB1bmRlciB0aGUgdGVybXMgYW5kXG4gKiBjb25kaXRpb25zIG9mIFNlY3Rpb24gMiBvZiB0aGUgU3BpbmUgRWRpdG9yIExpY2Vuc2UgQWdyZWVtZW50OlxuICogaHR0cDovL2Vzb3Rlcmljc29mdHdhcmUuY29tL3NwaW5lLWVkaXRvci1saWNlbnNlXG4gKlxuICogT3RoZXJ3aXNlLCBpdCBpcyBwZXJtaXR0ZWQgdG8gaW50ZWdyYXRlIHRoZSBTcGluZSBSdW50aW1lcyBpbnRvIHNvZnR3YXJlIG9yXG4gKiBvdGhlcndpc2UgY3JlYXRlIGRlcml2YXRpdmUgd29ya3Mgb2YgdGhlIFNwaW5lIFJ1bnRpbWVzIChjb2xsZWN0aXZlbHksXG4gKiBcIlByb2R1Y3RzXCIpLCBwcm92aWRlZCB0aGF0IGVhY2ggdXNlciBvZiB0aGUgUHJvZHVjdHMgbXVzdCBvYnRhaW4gdGhlaXIgb3duXG4gKiBTcGluZSBFZGl0b3IgbGljZW5zZSBhbmQgcmVkaXN0cmlidXRpb24gb2YgdGhlIFByb2R1Y3RzIGluIGFueSBmb3JtIG11c3RcbiAqIGluY2x1ZGUgdGhpcyBsaWNlbnNlIGFuZCBjb3B5cmlnaHQgbm90aWNlLlxuICpcbiAqIFRIRSBTUElORSBSVU5USU1FUyBBUkUgUFJPVklERUQgQlkgRVNPVEVSSUMgU09GVFdBUkUgTExDIFwiQVMgSVNcIiBBTkQgQU5ZXG4gKiBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBFU09URVJJQyBTT0ZUV0FSRSBMTEMgQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVMsXG4gKiBCVVNJTkVTUyBJTlRFUlJVUFRJT04sIE9SIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhFXG4gKiBTUElORSBSVU5USU1FUywgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuaW1wb3J0IHsgVmVydGV4QXR0YWNobWVudCwgQXR0YWNobWVudCB9IGZyb20gXCIuL2F0dGFjaG1lbnRzL0F0dGFjaG1lbnQuanNcIjtcbmltcG9ydCB7IElrQ29uc3RyYWludCB9IGZyb20gXCIuL0lrQ29uc3RyYWludC5qc1wiO1xuaW1wb3J0IHsgUGF0aENvbnN0cmFpbnQgfSBmcm9tIFwiLi9QYXRoQ29uc3RyYWludC5qc1wiO1xuaW1wb3J0IHsgUGh5c2ljcywgU2tlbGV0b24gfSBmcm9tIFwiLi9Ta2VsZXRvbi5qc1wiO1xuaW1wb3J0IHsgU2xvdCB9IGZyb20gXCIuL1Nsb3QuanNcIjtcbmltcG9ydCB7IFRyYW5zZm9ybUNvbnN0cmFpbnQgfSBmcm9tIFwiLi9UcmFuc2Zvcm1Db25zdHJhaW50LmpzXCI7XG5pbXBvcnQgeyBTdHJpbmdTZXQsIFV0aWxzLCBNYXRoVXRpbHMsIE51bWJlckFycmF5TGlrZSB9IGZyb20gXCIuL1V0aWxzLmpzXCI7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gXCIuL0V2ZW50LmpzXCI7XG5pbXBvcnQgeyBIYXNUZXh0dXJlUmVnaW9uIH0gZnJvbSBcIi4vYXR0YWNobWVudHMvSGFzVGV4dHVyZVJlZ2lvbi5qc1wiO1xuaW1wb3J0IHsgU2VxdWVuY2VNb2RlLCBTZXF1ZW5jZU1vZGVWYWx1ZXMgfSBmcm9tIFwiLi9hdHRhY2htZW50cy9TZXF1ZW5jZS5qc1wiO1xuaW1wb3J0IHsgUGh5c2ljc0NvbnN0cmFpbnQgfSBmcm9tIFwiLi9QaHlzaWNzQ29uc3RyYWludC5qc1wiO1xuaW1wb3J0IHsgUGh5c2ljc0NvbnN0cmFpbnREYXRhIH0gZnJvbSBcIi4vUGh5c2ljc0NvbnN0cmFpbnREYXRhLmpzXCI7XG5pbXBvcnQgeyBJbmhlcml0IH0gZnJvbSBcIi4vQm9uZURhdGEuanNcIjtcblxuLyoqIEEgc2ltcGxlIGNvbnRhaW5lciBmb3IgYSBsaXN0IG9mIHRpbWVsaW5lcyBhbmQgYSBuYW1lLiAqL1xuZXhwb3J0IGNsYXNzIEFuaW1hdGlvbiB7XG5cdC8qKiBUaGUgYW5pbWF0aW9uJ3MgbmFtZSwgd2hpY2ggaXMgdW5pcXVlIGFjcm9zcyBhbGwgYW5pbWF0aW9ucyBpbiB0aGUgc2tlbGV0b24uICovXG5cdG5hbWU6IHN0cmluZztcblx0dGltZWxpbmVzOiBBcnJheTxUaW1lbGluZT4gPSBbXTtcblx0dGltZWxpbmVJZHM6IFN0cmluZ1NldCA9IG5ldyBTdHJpbmdTZXQoKTtcblxuXHQvKiogVGhlIGR1cmF0aW9uIG9mIHRoZSBhbmltYXRpb24gaW4gc2Vjb25kcywgd2hpY2ggaXMgdGhlIGhpZ2hlc3QgdGltZSBvZiBhbGwga2V5cyBpbiB0aGUgdGltZWxpbmUuICovXG5cdGR1cmF0aW9uOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IgKG5hbWU6IHN0cmluZywgdGltZWxpbmVzOiBBcnJheTxUaW1lbGluZT4sIGR1cmF0aW9uOiBudW1iZXIpIHtcblx0XHRpZiAoIW5hbWUpIHRocm93IG5ldyBFcnJvcihcIm5hbWUgY2Fubm90IGJlIG51bGwuXCIpO1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdFx0dGhpcy5zZXRUaW1lbGluZXModGltZWxpbmVzKTtcblx0XHR0aGlzLmR1cmF0aW9uID0gZHVyYXRpb247XG5cdH1cblxuXHRzZXRUaW1lbGluZXMgKHRpbWVsaW5lczogQXJyYXk8VGltZWxpbmU+KSB7XG5cdFx0aWYgKCF0aW1lbGluZXMpIHRocm93IG5ldyBFcnJvcihcInRpbWVsaW5lcyBjYW5ub3QgYmUgbnVsbC5cIik7XG5cdFx0dGhpcy50aW1lbGluZXMgPSB0aW1lbGluZXM7XG5cdFx0dGhpcy50aW1lbGluZUlkcy5jbGVhcigpO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdGltZWxpbmVzLmxlbmd0aDsgaSsrKVxuXHRcdFx0dGhpcy50aW1lbGluZUlkcy5hZGRBbGwodGltZWxpbmVzW2ldLmdldFByb3BlcnR5SWRzKCkpO1xuXHR9XG5cblx0aGFzVGltZWxpbmUgKGlkczogc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGlkcy5sZW5ndGg7IGkrKylcblx0XHRcdGlmICh0aGlzLnRpbWVsaW5lSWRzLmNvbnRhaW5zKGlkc1tpXSkpIHJldHVybiB0cnVlO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKiBBcHBsaWVzIGFsbCB0aGUgYW5pbWF0aW9uJ3MgdGltZWxpbmVzIHRvIHRoZSBzcGVjaWZpZWQgc2tlbGV0b24uXG5cdCAqXG5cdCAqIFNlZSBUaW1lbGluZSB7QGxpbmsgVGltZWxpbmUjYXBwbHkoU2tlbGV0b24sIGZsb2F0LCBmbG9hdCwgQXJyYXksIGZsb2F0LCBNaXhCbGVuZCwgTWl4RGlyZWN0aW9uKX0uXG5cdCAqIEBwYXJhbSBsb29wIElmIHRydWUsIHRoZSBhbmltYXRpb24gcmVwZWF0cyBhZnRlciB7QGxpbmsgI2dldER1cmF0aW9uKCl9LlxuXHQgKiBAcGFyYW0gZXZlbnRzIE1heSBiZSBudWxsIHRvIGlnbm9yZSBmaXJlZCBldmVudHMuICovXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgbG9vcDogYm9vbGVhbiwgZXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRpZiAoIXNrZWxldG9uKSB0aHJvdyBuZXcgRXJyb3IoXCJza2VsZXRvbiBjYW5ub3QgYmUgbnVsbC5cIik7XG5cblx0XHRpZiAobG9vcCAmJiB0aGlzLmR1cmF0aW9uICE9IDApIHtcblx0XHRcdHRpbWUgJT0gdGhpcy5kdXJhdGlvbjtcblx0XHRcdGlmIChsYXN0VGltZSA+IDApIGxhc3RUaW1lICU9IHRoaXMuZHVyYXRpb247XG5cdFx0fVxuXG5cdFx0bGV0IHRpbWVsaW5lcyA9IHRoaXMudGltZWxpbmVzO1xuXHRcdGZvciAobGV0IGkgPSAwLCBuID0gdGltZWxpbmVzLmxlbmd0aDsgaSA8IG47IGkrKylcblx0XHRcdHRpbWVsaW5lc1tpXS5hcHBseShza2VsZXRvbiwgbGFzdFRpbWUsIHRpbWUsIGV2ZW50cywgYWxwaGEsIGJsZW5kLCBkaXJlY3Rpb24pO1xuXHR9XG59XG5cbi8qKiBDb250cm9scyBob3cgYSB0aW1lbGluZSB2YWx1ZSBpcyBtaXhlZCB3aXRoIHRoZSBzZXR1cCBwb3NlIHZhbHVlIG9yIGN1cnJlbnQgcG9zZSB2YWx1ZSB3aGVuIGEgdGltZWxpbmUncyBgYWxwaGFgXG4gKiA8IDEuXG4gKlxuICogU2VlIFRpbWVsaW5lIHtAbGluayBUaW1lbGluZSNhcHBseShTa2VsZXRvbiwgZmxvYXQsIGZsb2F0LCBBcnJheSwgZmxvYXQsIE1peEJsZW5kLCBNaXhEaXJlY3Rpb24pfS4gKi9cbmV4cG9ydCBlbnVtIE1peEJsZW5kIHtcblx0LyoqIFRyYW5zaXRpb25zIGZyb20gdGhlIHNldHVwIHZhbHVlIHRvIHRoZSB0aW1lbGluZSB2YWx1ZSAodGhlIGN1cnJlbnQgdmFsdWUgaXMgbm90IHVzZWQpLiBCZWZvcmUgdGhlIGZpcnN0IGtleSwgdGhlIHNldHVwXG5cdCAqIHZhbHVlIGlzIHNldC4gKi9cblx0c2V0dXAsXG5cdC8qKiBUcmFuc2l0aW9ucyBmcm9tIHRoZSBjdXJyZW50IHZhbHVlIHRvIHRoZSB0aW1lbGluZSB2YWx1ZS4gQmVmb3JlIHRoZSBmaXJzdCBrZXksIHRyYW5zaXRpb25zIGZyb20gdGhlIGN1cnJlbnQgdmFsdWUgdG9cblx0ICogdGhlIHNldHVwIHZhbHVlLiBUaW1lbGluZXMgd2hpY2ggcGVyZm9ybSBpbnN0YW50IHRyYW5zaXRpb25zLCBzdWNoIGFzIHtAbGluayBEcmF3T3JkZXJUaW1lbGluZX0gb3Jcblx0ICoge0BsaW5rIEF0dGFjaG1lbnRUaW1lbGluZX0sIHVzZSB0aGUgc2V0dXAgdmFsdWUgYmVmb3JlIHRoZSBmaXJzdCBrZXkuXG5cdCAqXG5cdCAqIGBmaXJzdGAgaXMgaW50ZW5kZWQgZm9yIHRoZSBmaXJzdCBhbmltYXRpb25zIGFwcGxpZWQsIG5vdCBmb3IgYW5pbWF0aW9ucyBsYXllcmVkIG9uIHRvcCBvZiB0aG9zZS4gKi9cblx0Zmlyc3QsXG5cdC8qKiBUcmFuc2l0aW9ucyBmcm9tIHRoZSBjdXJyZW50IHZhbHVlIHRvIHRoZSB0aW1lbGluZSB2YWx1ZS4gTm8gY2hhbmdlIGlzIG1hZGUgYmVmb3JlIHRoZSBmaXJzdCBrZXkgKHRoZSBjdXJyZW50IHZhbHVlIGlzXG5cdCAqIGtlcHQgdW50aWwgdGhlIGZpcnN0IGtleSkuXG5cdCAqXG5cdCAqIGByZXBsYWNlYCBpcyBpbnRlbmRlZCBmb3IgYW5pbWF0aW9ucyBsYXllcmVkIG9uIHRvcCBvZiBvdGhlcnMsIG5vdCBmb3IgdGhlIGZpcnN0IGFuaW1hdGlvbnMgYXBwbGllZC4gKi9cblx0cmVwbGFjZSxcblx0LyoqIFRyYW5zaXRpb25zIGZyb20gdGhlIGN1cnJlbnQgdmFsdWUgdG8gdGhlIGN1cnJlbnQgdmFsdWUgcGx1cyB0aGUgdGltZWxpbmUgdmFsdWUuIE5vIGNoYW5nZSBpcyBtYWRlIGJlZm9yZSB0aGUgZmlyc3Qga2V5XG5cdCAqICh0aGUgY3VycmVudCB2YWx1ZSBpcyBrZXB0IHVudGlsIHRoZSBmaXJzdCBrZXkpLlxuXHQgKlxuXHQgKiBgYWRkYCBpcyBpbnRlbmRlZCBmb3IgYW5pbWF0aW9ucyBsYXllcmVkIG9uIHRvcCBvZiBvdGhlcnMsIG5vdCBmb3IgdGhlIGZpcnN0IGFuaW1hdGlvbnMgYXBwbGllZC4gUHJvcGVydGllc1xuXHQgKiBrZXllZCBieSBhZGRpdGl2ZSBhbmltYXRpb25zIG11c3QgYmUgc2V0IG1hbnVhbGx5IG9yIGJ5IGFub3RoZXIgYW5pbWF0aW9uIGJlZm9yZSBhcHBseWluZyB0aGUgYWRkaXRpdmUgYW5pbWF0aW9ucywgZWxzZVxuXHQgKiB0aGUgcHJvcGVydHkgdmFsdWVzIHdpbGwgaW5jcmVhc2UgY29udGludWFsbHkuICovXG5cdGFkZFxufVxuXG4vKiogSW5kaWNhdGVzIHdoZXRoZXIgYSB0aW1lbGluZSdzIGBhbHBoYWAgaXMgbWl4aW5nIG91dCBvdmVyIHRpbWUgdG93YXJkIDAgKHRoZSBzZXR1cCBvciBjdXJyZW50IHBvc2UgdmFsdWUpIG9yXG4gKiBtaXhpbmcgaW4gdG93YXJkIDEgKHRoZSB0aW1lbGluZSdzIHZhbHVlKS5cbiAqXG4gKiBTZWUgVGltZWxpbmUge0BsaW5rIFRpbWVsaW5lI2FwcGx5KFNrZWxldG9uLCBmbG9hdCwgZmxvYXQsIEFycmF5LCBmbG9hdCwgTWl4QmxlbmQsIE1peERpcmVjdGlvbil9LiAqL1xuZXhwb3J0IGVudW0gTWl4RGlyZWN0aW9uIHtcblx0bWl4SW4sIG1peE91dFxufVxuXG5jb25zdCBQcm9wZXJ0eSA9IHtcblx0cm90YXRlOiAwLFxuXHR4OiAxLFxuXHR5OiAyLFxuXHRzY2FsZVg6IDMsXG5cdHNjYWxlWTogNCxcblx0c2hlYXJYOiA1LFxuXHRzaGVhclk6IDYsXG5cdGluaGVyaXQ6IDcsXG5cblx0cmdiOiA4LFxuXHRhbHBoYTogOSxcblx0cmdiMjogMTAsXG5cblx0YXR0YWNobWVudDogMTEsXG5cdGRlZm9ybTogMTIsXG5cblx0ZXZlbnQ6IDEzLFxuXHRkcmF3T3JkZXI6IDE0LFxuXG5cdGlrQ29uc3RyYWludDogMTUsXG5cdHRyYW5zZm9ybUNvbnN0cmFpbnQ6IDE2LFxuXG5cdHBhdGhDb25zdHJhaW50UG9zaXRpb246IDE3LFxuXHRwYXRoQ29uc3RyYWludFNwYWNpbmc6IDE4LFxuXHRwYXRoQ29uc3RyYWludE1peDogMTksXG5cblx0cGh5c2ljc0NvbnN0cmFpbnRJbmVydGlhOiAyMCxcblx0cGh5c2ljc0NvbnN0cmFpbnRTdHJlbmd0aDogMjEsXG5cdHBoeXNpY3NDb25zdHJhaW50RGFtcGluZzogMjIsXG5cdHBoeXNpY3NDb25zdHJhaW50TWFzczogMjMsXG5cdHBoeXNpY3NDb25zdHJhaW50V2luZDogMjQsXG5cdHBoeXNpY3NDb25zdHJhaW50R3Jhdml0eTogMjUsXG5cdHBoeXNpY3NDb25zdHJhaW50TWl4OiAyNixcblx0cGh5c2ljc0NvbnN0cmFpbnRSZXNldDogMjcsXG5cblx0c2VxdWVuY2U6IDI4LFxufVxuXG4vKiogVGhlIGludGVyZmFjZSBmb3IgYWxsIHRpbWVsaW5lcy4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBUaW1lbGluZSB7XG5cdHByb3BlcnR5SWRzOiBzdHJpbmdbXTtcblx0ZnJhbWVzOiBOdW1iZXJBcnJheUxpa2U7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgcHJvcGVydHlJZHM6IHN0cmluZ1tdKSB7XG5cdFx0dGhpcy5wcm9wZXJ0eUlkcyA9IHByb3BlcnR5SWRzO1xuXHRcdHRoaXMuZnJhbWVzID0gVXRpbHMubmV3RmxvYXRBcnJheShmcmFtZUNvdW50ICogdGhpcy5nZXRGcmFtZUVudHJpZXMoKSk7XG5cdH1cblxuXHRnZXRQcm9wZXJ0eUlkcyAoKSB7XG5cdFx0cmV0dXJuIHRoaXMucHJvcGVydHlJZHM7XG5cdH1cblxuXHRnZXRGcmFtZUVudHJpZXMgKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRnZXRGcmFtZUNvdW50ICgpIHtcblx0XHRyZXR1cm4gdGhpcy5mcmFtZXMubGVuZ3RoIC8gdGhpcy5nZXRGcmFtZUVudHJpZXMoKTtcblx0fVxuXG5cdGdldER1cmF0aW9uICgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmZyYW1lc1t0aGlzLmZyYW1lcy5sZW5ndGggLSB0aGlzLmdldEZyYW1lRW50cmllcygpXTtcblx0fVxuXG5cdGFic3RyYWN0IGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZXZlbnRzOiBBcnJheTxFdmVudD4gfCBudWxsLCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKTogdm9pZDtcblxuXHRzdGF0aWMgc2VhcmNoMSAoZnJhbWVzOiBOdW1iZXJBcnJheUxpa2UsIHRpbWU6IG51bWJlcikge1xuXHRcdGxldCBuID0gZnJhbWVzLmxlbmd0aDtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IG47IGkrKylcblx0XHRcdGlmIChmcmFtZXNbaV0gPiB0aW1lKSByZXR1cm4gaSAtIDE7XG5cdFx0cmV0dXJuIG4gLSAxO1xuXHR9XG5cblx0c3RhdGljIHNlYXJjaCAoZnJhbWVzOiBOdW1iZXJBcnJheUxpa2UsIHRpbWU6IG51bWJlciwgc3RlcDogbnVtYmVyKSB7XG5cdFx0bGV0IG4gPSBmcmFtZXMubGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSBzdGVwOyBpIDwgbjsgaSArPSBzdGVwKVxuXHRcdFx0aWYgKGZyYW1lc1tpXSA+IHRpbWUpIHJldHVybiBpIC0gc3RlcDtcblx0XHRyZXR1cm4gbiAtIHN0ZXA7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBCb25lVGltZWxpbmUge1xuXHQvKiogVGhlIGluZGV4IG9mIHRoZSBib25lIGluIHtAbGluayBTa2VsZXRvbiNib25lc30gdGhhdCB3aWxsIGJlIGNoYW5nZWQuICovXG5cdGJvbmVJbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNsb3RUaW1lbGluZSB7XG5cdC8qKiBUaGUgaW5kZXggb2YgdGhlIHNsb3QgaW4ge0BsaW5rIFNrZWxldG9uI3Nsb3RzfSB0aGF0IHdpbGwgYmUgY2hhbmdlZC4gKi9cblx0c2xvdEluZGV4OiBudW1iZXI7XG59XG5cbi8qKiBUaGUgYmFzZSBjbGFzcyBmb3IgdGltZWxpbmVzIHRoYXQgdXNlIGludGVycG9sYXRpb24gYmV0d2VlbiBrZXkgZnJhbWUgdmFsdWVzLiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEN1cnZlVGltZWxpbmUgZXh0ZW5kcyBUaW1lbGluZSB7XG5cdHByb3RlY3RlZCBjdXJ2ZXM6IE51bWJlckFycmF5TGlrZTsgLy8gdHlwZSwgeCwgeSwgLi4uXG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcHJvcGVydHlJZHM6IHN0cmluZ1tdKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgcHJvcGVydHlJZHMpO1xuXHRcdHRoaXMuY3VydmVzID0gVXRpbHMubmV3RmxvYXRBcnJheShmcmFtZUNvdW50ICsgYmV6aWVyQ291bnQgKiAxOC8qQkVaSUVSX1NJWkUqLyk7XG5cdFx0dGhpcy5jdXJ2ZXNbZnJhbWVDb3VudCAtIDFdID0gMS8qU1RFUFBFRCovO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUgdG8gbGluZWFyIGludGVycG9sYXRpb24uICovXG5cdHNldExpbmVhciAoZnJhbWU6IG51bWJlcikge1xuXHRcdHRoaXMuY3VydmVzW2ZyYW1lXSA9IDAvKkxJTkVBUiovO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUgdG8gc3RlcHBlZCBpbnRlcnBvbGF0aW9uLiAqL1xuXHRzZXRTdGVwcGVkIChmcmFtZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5jdXJ2ZXNbZnJhbWVdID0gMS8qU1RFUFBFRCovO1xuXHR9XG5cblx0LyoqIFNocmlua3MgdGhlIHN0b3JhZ2UgZm9yIEJlemllciBjdXJ2ZXMsIGZvciB1c2Ugd2hlbiA8Y29kZT5iZXppZXJDb3VudDwvY29kZT4gKHNwZWNpZmllZCBpbiB0aGUgY29uc3RydWN0b3IpIHdhcyBsYXJnZXJcblx0ICogdGhhbiB0aGUgYWN0dWFsIG51bWJlciBvZiBCZXppZXIgY3VydmVzLiAqL1xuXHRzaHJpbmsgKGJlemllckNvdW50OiBudW1iZXIpIHtcblx0XHRsZXQgc2l6ZSA9IHRoaXMuZ2V0RnJhbWVDb3VudCgpICsgYmV6aWVyQ291bnQgKiAxOC8qQkVaSUVSX1NJWkUqLztcblx0XHRpZiAodGhpcy5jdXJ2ZXMubGVuZ3RoID4gc2l6ZSkge1xuXHRcdFx0bGV0IG5ld0N1cnZlcyA9IFV0aWxzLm5ld0Zsb2F0QXJyYXkoc2l6ZSk7XG5cdFx0XHRVdGlscy5hcnJheUNvcHkodGhpcy5jdXJ2ZXMsIDAsIG5ld0N1cnZlcywgMCwgc2l6ZSk7XG5cdFx0XHR0aGlzLmN1cnZlcyA9IG5ld0N1cnZlcztcblx0XHR9XG5cdH1cblxuXHQvKiogU3RvcmVzIHRoZSBzZWdtZW50cyBmb3IgdGhlIHNwZWNpZmllZCBCZXppZXIgY3VydmUuIEZvciB0aW1lbGluZXMgdGhhdCBtb2RpZnkgbXVsdGlwbGUgdmFsdWVzLCB0aGVyZSBtYXkgYmUgbW9yZSB0aGFuXG5cdCAqIG9uZSBjdXJ2ZSBwZXIgZnJhbWUuXG5cdCAqIEBwYXJhbSBiZXppZXIgVGhlIG9yZGluYWwgb2YgdGhpcyBCZXppZXIgY3VydmUgZm9yIHRoaXMgdGltZWxpbmUsIGJldHdlZW4gMCBhbmQgPGNvZGU+YmV6aWVyQ291bnQgLSAxPC9jb2RlPiAoc3BlY2lmaWVkXG5cdCAqICAgICAgICAgICBpbiB0aGUgY29uc3RydWN0b3IpLCBpbmNsdXNpdmUuXG5cdCAqIEBwYXJhbSBmcmFtZSBCZXR3ZWVuIDAgYW5kIDxjb2RlPmZyYW1lQ291bnQgLSAxPC9jb2RlPiwgaW5jbHVzaXZlLlxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIGluZGV4IG9mIHRoZSB2YWx1ZSBmb3IgdGhpcyBmcmFtZSB0aGF0IHRoaXMgY3VydmUgaXMgdXNlZCBmb3IuXG5cdCAqIEBwYXJhbSB0aW1lMSBUaGUgdGltZSBmb3IgdGhlIGZpcnN0IGtleS5cblx0ICogQHBhcmFtIHZhbHVlMSBUaGUgdmFsdWUgZm9yIHRoZSBmaXJzdCBrZXkuXG5cdCAqIEBwYXJhbSBjeDEgVGhlIHRpbWUgZm9yIHRoZSBmaXJzdCBCZXppZXIgaGFuZGxlLlxuXHQgKiBAcGFyYW0gY3kxIFRoZSB2YWx1ZSBmb3IgdGhlIGZpcnN0IEJlemllciBoYW5kbGUuXG5cdCAqIEBwYXJhbSBjeDIgVGhlIHRpbWUgb2YgdGhlIHNlY29uZCBCZXppZXIgaGFuZGxlLlxuXHQgKiBAcGFyYW0gY3kyIFRoZSB2YWx1ZSBmb3IgdGhlIHNlY29uZCBCZXppZXIgaGFuZGxlLlxuXHQgKiBAcGFyYW0gdGltZTIgVGhlIHRpbWUgZm9yIHRoZSBzZWNvbmQga2V5LlxuXHQgKiBAcGFyYW0gdmFsdWUyIFRoZSB2YWx1ZSBmb3IgdGhlIHNlY29uZCBrZXkuICovXG5cdHNldEJlemllciAoYmV6aWVyOiBudW1iZXIsIGZyYW1lOiBudW1iZXIsIHZhbHVlOiBudW1iZXIsIHRpbWUxOiBudW1iZXIsIHZhbHVlMTogbnVtYmVyLCBjeDE6IG51bWJlciwgY3kxOiBudW1iZXIsIGN4MjogbnVtYmVyLFxuXHRcdGN5MjogbnVtYmVyLCB0aW1lMjogbnVtYmVyLCB2YWx1ZTI6IG51bWJlcikge1xuXHRcdGxldCBjdXJ2ZXMgPSB0aGlzLmN1cnZlcztcblx0XHRsZXQgaSA9IHRoaXMuZ2V0RnJhbWVDb3VudCgpICsgYmV6aWVyICogMTgvKkJFWklFUl9TSVpFKi87XG5cdFx0aWYgKHZhbHVlID09IDApIGN1cnZlc1tmcmFtZV0gPSAyLypCRVpJRVIqLyArIGk7XG5cdFx0bGV0IHRtcHggPSAodGltZTEgLSBjeDEgKiAyICsgY3gyKSAqIDAuMDMsIHRtcHkgPSAodmFsdWUxIC0gY3kxICogMiArIGN5MikgKiAwLjAzO1xuXHRcdGxldCBkZGR4ID0gKChjeDEgLSBjeDIpICogMyAtIHRpbWUxICsgdGltZTIpICogMC4wMDYsIGRkZHkgPSAoKGN5MSAtIGN5MikgKiAzIC0gdmFsdWUxICsgdmFsdWUyKSAqIDAuMDA2O1xuXHRcdGxldCBkZHggPSB0bXB4ICogMiArIGRkZHgsIGRkeSA9IHRtcHkgKiAyICsgZGRkeTtcblx0XHRsZXQgZHggPSAoY3gxIC0gdGltZTEpICogMC4zICsgdG1weCArIGRkZHggKiAwLjE2NjY2NjY3LCBkeSA9IChjeTEgLSB2YWx1ZTEpICogMC4zICsgdG1weSArIGRkZHkgKiAwLjE2NjY2NjY3O1xuXHRcdGxldCB4ID0gdGltZTEgKyBkeCwgeSA9IHZhbHVlMSArIGR5O1xuXHRcdGZvciAobGV0IG4gPSBpICsgMTgvKkJFWklFUl9TSVpFKi87IGkgPCBuOyBpICs9IDIpIHtcblx0XHRcdGN1cnZlc1tpXSA9IHg7XG5cdFx0XHRjdXJ2ZXNbaSArIDFdID0geTtcblx0XHRcdGR4ICs9IGRkeDtcblx0XHRcdGR5ICs9IGRkeTtcblx0XHRcdGRkeCArPSBkZGR4O1xuXHRcdFx0ZGR5ICs9IGRkZHk7XG5cdFx0XHR4ICs9IGR4O1xuXHRcdFx0eSArPSBkeTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgQmV6aWVyIGludGVycG9sYXRlZCB2YWx1ZSBmb3IgdGhlIHNwZWNpZmllZCB0aW1lLlxuXHQgKiBAcGFyYW0gZnJhbWVJbmRleCBUaGUgaW5kZXggaW50byB7QGxpbmsgI2dldEZyYW1lcygpfSBmb3IgdGhlIHZhbHVlcyBvZiB0aGUgZnJhbWUgYmVmb3JlIDxjb2RlPnRpbWU8L2NvZGU+LlxuXHQgKiBAcGFyYW0gdmFsdWVPZmZzZXQgVGhlIG9mZnNldCBmcm9tIDxjb2RlPmZyYW1lSW5kZXg8L2NvZGU+IHRvIHRoZSB2YWx1ZSB0aGlzIGN1cnZlIGlzIHVzZWQgZm9yLlxuXHQgKiBAcGFyYW0gaSBUaGUgaW5kZXggb2YgdGhlIEJlemllciBzZWdtZW50cy4gU2VlIHtAbGluayAjZ2V0Q3VydmVUeXBlKGludCl9LiAqL1xuXHRnZXRCZXppZXJWYWx1ZSAodGltZTogbnVtYmVyLCBmcmFtZUluZGV4OiBudW1iZXIsIHZhbHVlT2Zmc2V0OiBudW1iZXIsIGk6IG51bWJlcikge1xuXHRcdGxldCBjdXJ2ZXMgPSB0aGlzLmN1cnZlcztcblx0XHRpZiAoY3VydmVzW2ldID4gdGltZSkge1xuXHRcdFx0bGV0IHggPSB0aGlzLmZyYW1lc1tmcmFtZUluZGV4XSwgeSA9IHRoaXMuZnJhbWVzW2ZyYW1lSW5kZXggKyB2YWx1ZU9mZnNldF07XG5cdFx0XHRyZXR1cm4geSArICh0aW1lIC0geCkgLyAoY3VydmVzW2ldIC0geCkgKiAoY3VydmVzW2kgKyAxXSAtIHkpO1xuXHRcdH1cblx0XHRsZXQgbiA9IGkgKyAxOC8qQkVaSUVSX1NJWkUqLztcblx0XHRmb3IgKGkgKz0gMjsgaSA8IG47IGkgKz0gMikge1xuXHRcdFx0aWYgKGN1cnZlc1tpXSA+PSB0aW1lKSB7XG5cdFx0XHRcdGxldCB4ID0gY3VydmVzW2kgLSAyXSwgeSA9IGN1cnZlc1tpIC0gMV07XG5cdFx0XHRcdHJldHVybiB5ICsgKHRpbWUgLSB4KSAvIChjdXJ2ZXNbaV0gLSB4KSAqIChjdXJ2ZXNbaSArIDFdIC0geSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZyYW1lSW5kZXggKz0gdGhpcy5nZXRGcmFtZUVudHJpZXMoKTtcblx0XHRsZXQgeCA9IGN1cnZlc1tuIC0gMl0sIHkgPSBjdXJ2ZXNbbiAtIDFdO1xuXHRcdHJldHVybiB5ICsgKHRpbWUgLSB4KSAvICh0aGlzLmZyYW1lc1tmcmFtZUluZGV4XSAtIHgpICogKHRoaXMuZnJhbWVzW2ZyYW1lSW5kZXggKyB2YWx1ZU9mZnNldF0gLSB5KTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ3VydmVUaW1lbGluZTEgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lIHtcblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcHJvcGVydHlJZDogc3RyaW5nKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFtwcm9wZXJ0eUlkXSk7XG5cdH1cblxuXHRnZXRGcmFtZUVudHJpZXMgKCkge1xuXHRcdHJldHVybiAyLypFTlRSSUVTKi87XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgdGltZSBhbmQgdmFsdWUgZm9yIHRoZSBzcGVjaWZpZWQgZnJhbWUuXG5cdCAqIEBwYXJhbSBmcmFtZSBCZXR3ZWVuIDAgYW5kIDxjb2RlPmZyYW1lQ291bnQ8L2NvZGU+LCBpbmNsdXNpdmUuXG5cdCAqIEBwYXJhbSB0aW1lIFRoZSBmcmFtZSB0aW1lIGluIHNlY29uZHMuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIHZhbHVlOiBudW1iZXIpIHtcblx0XHRmcmFtZSA8PD0gMTtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMS8qVkFMVUUqL10gPSB2YWx1ZTtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHRoZSBpbnRlcnBvbGF0ZWQgdmFsdWUgZm9yIHRoZSBzcGVjaWZpZWQgdGltZS4gKi9cblx0Z2V0Q3VydmVWYWx1ZSAodGltZTogbnVtYmVyKSB7XG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGxldCBpID0gZnJhbWVzLmxlbmd0aCAtIDI7XG5cdFx0Zm9yIChsZXQgaWkgPSAyOyBpaSA8PSBpOyBpaSArPSAyKSB7XG5cdFx0XHRpZiAoZnJhbWVzW2lpXSA+IHRpbWUpIHtcblx0XHRcdFx0aSA9IGlpIC0gMjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGN1cnZlVHlwZSA9IHRoaXMuY3VydmVzW2kgPj4gMV07XG5cdFx0c3dpdGNoIChjdXJ2ZVR5cGUpIHtcblx0XHRcdGNhc2UgMC8qTElORUFSKi86XG5cdFx0XHRcdGxldCBiZWZvcmUgPSBmcmFtZXNbaV0sIHZhbHVlID0gZnJhbWVzW2kgKyAxLypWQUxVRSovXTtcblx0XHRcdFx0cmV0dXJuIHZhbHVlICsgKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgMi8qRU5UUklFUyovXSAtIGJlZm9yZSkgKiAoZnJhbWVzW2kgKyAyLypFTlRSSUVTKi8gKyAxLypWQUxVRSovXSAtIHZhbHVlKTtcblx0XHRcdGNhc2UgMS8qU1RFUFBFRCovOlxuXHRcdFx0XHRyZXR1cm4gZnJhbWVzW2kgKyAxLypWQUxVRSovXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMS8qVkFMVUUqLywgY3VydmVUeXBlIC0gMi8qQkVaSUVSKi8pO1xuXHR9XG5cblx0Z2V0UmVsYXRpdmVWYWx1ZSAodGltZTogbnVtYmVyLCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGN1cnJlbnQ6IG51bWJlciwgc2V0dXA6IG51bWJlcikge1xuXHRcdGlmICh0aW1lIDwgdGhpcy5mcmFtZXNbMF0pIHtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRyZXR1cm4gc2V0dXA7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnQgKyAoc2V0dXAgLSBjdXJyZW50KSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdFx0fVxuXHRcdGxldCB2YWx1ZSA9IHRoaXMuZ2V0Q3VydmVWYWx1ZSh0aW1lKTtcblx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRjYXNlIE1peEJsZW5kLnNldHVwOlxuXHRcdFx0XHRyZXR1cm4gc2V0dXAgKyB2YWx1ZSAqIGFscGhhO1xuXHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdGNhc2UgTWl4QmxlbmQucmVwbGFjZTpcblx0XHRcdFx0dmFsdWUgKz0gc2V0dXAgLSBjdXJyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudCArIHZhbHVlICogYWxwaGE7XG5cdH1cblxuXHRnZXRBYnNvbHV0ZVZhbHVlICh0aW1lOiBudW1iZXIsIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgY3VycmVudDogbnVtYmVyLCBzZXR1cDogbnVtYmVyKSB7XG5cdFx0aWYgKHRpbWUgPCB0aGlzLmZyYW1lc1swXSkge1xuXHRcdFx0c3dpdGNoIChibGVuZCkge1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLnNldHVwOlxuXHRcdFx0XHRcdHJldHVybiBzZXR1cDtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdFx0XHRyZXR1cm4gY3VycmVudCArIChzZXR1cCAtIGN1cnJlbnQpICogYWxwaGE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY3VycmVudDtcblx0XHR9XG5cdFx0bGV0IHZhbHVlID0gdGhpcy5nZXRDdXJ2ZVZhbHVlKHRpbWUpO1xuXHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5zZXR1cCkgcmV0dXJuIHNldHVwICsgKHZhbHVlIC0gc2V0dXApICogYWxwaGE7XG5cdFx0cmV0dXJuIGN1cnJlbnQgKyAodmFsdWUgLSBjdXJyZW50KSAqIGFscGhhO1xuXHR9XG5cblx0Z2V0QWJzb2x1dGVWYWx1ZTIgKHRpbWU6IG51bWJlciwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBjdXJyZW50OiBudW1iZXIsIHNldHVwOiBudW1iZXIsIHZhbHVlOiBudW1iZXIpIHtcblx0XHRpZiAodGltZSA8IHRoaXMuZnJhbWVzWzBdKSB7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0cmV0dXJuIHNldHVwO1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50ICsgKHNldHVwIC0gY3VycmVudCkgKiBhbHBoYTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjdXJyZW50O1xuXHRcdH1cblx0XHRpZiAoYmxlbmQgPT0gTWl4QmxlbmQuc2V0dXApIHJldHVybiBzZXR1cCArICh2YWx1ZSAtIHNldHVwKSAqIGFscGhhO1xuXHRcdHJldHVybiBjdXJyZW50ICsgKHZhbHVlIC0gY3VycmVudCkgKiBhbHBoYTtcblx0fVxuXG5cdGdldFNjYWxlVmFsdWUgKHRpbWU6IG51bWJlciwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbiwgY3VycmVudDogbnVtYmVyLCBzZXR1cDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRyZXR1cm4gc2V0dXA7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnQgKyAoc2V0dXAgLSBjdXJyZW50KSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdFx0fVxuXHRcdGxldCB2YWx1ZSA9IHRoaXMuZ2V0Q3VydmVWYWx1ZSh0aW1lKSAqIHNldHVwO1xuXHRcdGlmIChhbHBoYSA9PSAxKSB7XG5cdFx0XHRpZiAoYmxlbmQgPT0gTWl4QmxlbmQuYWRkKSByZXR1cm4gY3VycmVudCArIHZhbHVlIC0gc2V0dXA7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHRcdC8vIE1peGluZyBvdXQgdXNlcyBzaWduIG9mIHNldHVwIG9yIGN1cnJlbnQgcG9zZSwgZWxzZSB1c2Ugc2lnbiBvZiBrZXkuXG5cdFx0aWYgKGRpcmVjdGlvbiA9PSBNaXhEaXJlY3Rpb24ubWl4T3V0KSB7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0cmV0dXJuIHNldHVwICsgKE1hdGguYWJzKHZhbHVlKSAqIE1hdGhVdGlscy5zaWdudW0oc2V0dXApIC0gc2V0dXApICogYWxwaGE7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQucmVwbGFjZTpcblx0XHRcdFx0XHRyZXR1cm4gY3VycmVudCArIChNYXRoLmFicyh2YWx1ZSkgKiBNYXRoVXRpbHMuc2lnbnVtKGN1cnJlbnQpIC0gY3VycmVudCkgKiBhbHBoYTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHMgPSAwO1xuXHRcdFx0c3dpdGNoIChibGVuZCkge1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLnNldHVwOlxuXHRcdFx0XHRcdHMgPSBNYXRoLmFicyhzZXR1cCkgKiBNYXRoVXRpbHMuc2lnbnVtKHZhbHVlKTtcblx0XHRcdFx0XHRyZXR1cm4gcyArICh2YWx1ZSAtIHMpICogYWxwaGE7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQucmVwbGFjZTpcblx0XHRcdFx0XHRzID0gTWF0aC5hYnMoY3VycmVudCkgKiBNYXRoVXRpbHMuc2lnbnVtKHZhbHVlKTtcblx0XHRcdFx0XHRyZXR1cm4gcyArICh2YWx1ZSAtIHMpICogYWxwaGE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50ICsgKHZhbHVlIC0gc2V0dXApICogYWxwaGE7XG5cdH1cbn1cblxuLyoqIFRoZSBiYXNlIGNsYXNzIGZvciBhIHtAbGluayBDdXJ2ZVRpbWVsaW5lfSB3aGljaCBzZXRzIHR3byBwcm9wZXJ0aWVzLiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEN1cnZlVGltZWxpbmUyIGV4dGVuZHMgQ3VydmVUaW1lbGluZSB7XG5cdC8qKiBAcGFyYW0gYmV6aWVyQ291bnQgVGhlIG1heGltdW0gbnVtYmVyIG9mIEJlemllciBjdXJ2ZXMuIFNlZSB7QGxpbmsgI3NocmluayhpbnQpfS5cblx0ICogQHBhcmFtIHByb3BlcnR5SWRzIFVuaXF1ZSBpZGVudGlmaWVycyBmb3IgdGhlIHByb3BlcnRpZXMgdGhlIHRpbWVsaW5lIG1vZGlmaWVzLiAqL1xuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBwcm9wZXJ0eUlkMTogc3RyaW5nLCBwcm9wZXJ0eUlkMjogc3RyaW5nKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFtwcm9wZXJ0eUlkMSwgcHJvcGVydHlJZDJdKTtcblx0fVxuXG5cdGdldEZyYW1lRW50cmllcyAoKSB7XG5cdFx0cmV0dXJuIDMvKkVOVFJJRVMqLztcblx0fVxuXG5cdC8qKiBTZXRzIHRoZSB0aW1lIGFuZCB2YWx1ZXMgZm9yIHRoZSBzcGVjaWZpZWQgZnJhbWUuXG5cdCAqIEBwYXJhbSBmcmFtZSBCZXR3ZWVuIDAgYW5kIDxjb2RlPmZyYW1lQ291bnQ8L2NvZGU+LCBpbmNsdXNpdmUuXG5cdCAqIEBwYXJhbSB0aW1lIFRoZSBmcmFtZSB0aW1lIGluIHNlY29uZHMuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIHZhbHVlMTogbnVtYmVyLCB2YWx1ZTI6IG51bWJlcikge1xuXHRcdGZyYW1lICo9IDMvKkVOVFJJRVMqLztcblx0XHR0aGlzLmZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMS8qVkFMVUUxKi9dID0gdmFsdWUxO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMi8qVkFMVUUyKi9dID0gdmFsdWUyO1xuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgYm9uZSdzIGxvY2FsIHtAbGluayBCb25lI3JvdGF0aW9ufS4gKi9cbmV4cG9ydCBjbGFzcyBSb3RhdGVUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUxIGltcGxlbWVudHMgQm9uZVRpbWVsaW5lIHtcblx0Ym9uZUluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBib25lSW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBQcm9wZXJ0eS5yb3RhdGUgKyBcInxcIiArIGJvbmVJbmRleCk7XG5cdFx0dGhpcy5ib25lSW5kZXggPSBib25lSW5kZXg7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+IHwgbnVsbCwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBib25lID0gc2tlbGV0b24uYm9uZXNbdGhpcy5ib25lSW5kZXhdO1xuXHRcdGlmIChib25lLmFjdGl2ZSkgYm9uZS5yb3RhdGlvbiA9IHRoaXMuZ2V0UmVsYXRpdmVWYWx1ZSh0aW1lLCBhbHBoYSwgYmxlbmQsIGJvbmUucm90YXRpb24sIGJvbmUuZGF0YS5yb3RhdGlvbik7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBib25lJ3MgbG9jYWwge0BsaW5rIEJvbmUjeH0gYW5kIHtAbGluayBCb25lI3l9LiAqL1xuZXhwb3J0IGNsYXNzIFRyYW5zbGF0ZVRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZTIgaW1wbGVtZW50cyBCb25lVGltZWxpbmUge1xuXHRib25lSW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIGJvbmVJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsXG5cdFx0XHRQcm9wZXJ0eS54ICsgXCJ8XCIgKyBib25lSW5kZXgsXG5cdFx0XHRQcm9wZXJ0eS55ICsgXCJ8XCIgKyBib25lSW5kZXgsXG5cdFx0KTtcblx0XHR0aGlzLmJvbmVJbmRleCA9IGJvbmVJbmRleDtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgYm9uZSA9IHNrZWxldG9uLmJvbmVzW3RoaXMuYm9uZUluZGV4XTtcblx0XHRpZiAoIWJvbmUuYWN0aXZlKSByZXR1cm47XG5cblx0XHRsZXQgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRib25lLnggPSBib25lLmRhdGEueDtcblx0XHRcdFx0XHRib25lLnkgPSBib25lLmRhdGEueTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdFx0Ym9uZS54ICs9IChib25lLmRhdGEueCAtIGJvbmUueCkgKiBhbHBoYTtcblx0XHRcdFx0XHRib25lLnkgKz0gKGJvbmUuZGF0YS55IC0gYm9uZS55KSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB4ID0gMCwgeSA9IDA7XG5cdFx0bGV0IGkgPSBUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCAzLypFTlRSSUVTKi8pO1xuXHRcdGxldCBjdXJ2ZVR5cGUgPSB0aGlzLmN1cnZlc1tpIC8gMy8qRU5UUklFUyovXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0eCA9IGZyYW1lc1tpICsgMS8qVkFMVUUxKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAyLypWQUxVRTIqL107XG5cdFx0XHRcdGxldCB0ID0gKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgMy8qRU5UUklFUyovXSAtIGJlZm9yZSk7XG5cdFx0XHRcdHggKz0gKGZyYW1lc1tpICsgMy8qRU5UUklFUyovICsgMS8qVkFMVUUxKi9dIC0geCkgKiB0O1xuXHRcdFx0XHR5ICs9IChmcmFtZXNbaSArIDMvKkVOVFJJRVMqLyArIDIvKlZBTFVFMiovXSAtIHkpICogdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDEvKlNURVBQRUQqLzpcblx0XHRcdFx0eCA9IGZyYW1lc1tpICsgMS8qVkFMVUUxKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAyLypWQUxVRTIqL107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0eCA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMS8qVkFMVUUxKi8sIGN1cnZlVHlwZSAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qVkFMVUUyKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovIC0gMi8qQkVaSUVSKi8pO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdGJvbmUueCA9IGJvbmUuZGF0YS54ICsgeCAqIGFscGhhO1xuXHRcdFx0XHRib25lLnkgPSBib25lLmRhdGEueSArIHkgKiBhbHBoYTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0Y2FzZSBNaXhCbGVuZC5yZXBsYWNlOlxuXHRcdFx0XHRib25lLnggKz0gKGJvbmUuZGF0YS54ICsgeCAtIGJvbmUueCkgKiBhbHBoYTtcblx0XHRcdFx0Ym9uZS55ICs9IChib25lLmRhdGEueSArIHkgLSBib25lLnkpICogYWxwaGE7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNaXhCbGVuZC5hZGQ6XG5cdFx0XHRcdGJvbmUueCArPSB4ICogYWxwaGE7XG5cdFx0XHRcdGJvbmUueSArPSB5ICogYWxwaGE7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgYm9uZSdzIGxvY2FsIHtAbGluayBCb25lI3h9LiAqL1xuZXhwb3J0IGNsYXNzIFRyYW5zbGF0ZVhUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUxIGltcGxlbWVudHMgQm9uZVRpbWVsaW5lIHtcblx0Ym9uZUluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBib25lSW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBQcm9wZXJ0eS54ICsgXCJ8XCIgKyBib25lSW5kZXgpO1xuXHRcdHRoaXMuYm9uZUluZGV4ID0gYm9uZUluZGV4O1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBldmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBib25lID0gc2tlbGV0b24uYm9uZXNbdGhpcy5ib25lSW5kZXhdO1xuXHRcdGlmIChib25lLmFjdGl2ZSkgYm9uZS54ID0gdGhpcy5nZXRSZWxhdGl2ZVZhbHVlKHRpbWUsIGFscGhhLCBibGVuZCwgYm9uZS54LCBib25lLmRhdGEueCk7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBib25lJ3MgbG9jYWwge0BsaW5rIEJvbmUjeH0uICovXG5leHBvcnQgY2xhc3MgVHJhbnNsYXRlWVRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZTEgaW1wbGVtZW50cyBCb25lVGltZWxpbmUge1xuXHRib25lSW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIGJvbmVJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFByb3BlcnR5LnkgKyBcInxcIiArIGJvbmVJbmRleCk7XG5cdFx0dGhpcy5ib25lSW5kZXggPSBib25lSW5kZXg7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IGJvbmUgPSBza2VsZXRvbi5ib25lc1t0aGlzLmJvbmVJbmRleF07XG5cdFx0aWYgKGJvbmUuYWN0aXZlKSBib25lLnkgPSB0aGlzLmdldFJlbGF0aXZlVmFsdWUodGltZSwgYWxwaGEsIGJsZW5kLCBib25lLnksIGJvbmUuZGF0YS55KTtcblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIGJvbmUncyBsb2NhbCB7QGxpbmsgQm9uZSNzY2FsZVgpfSBhbmQge0BsaW5rIEJvbmUjc2NhbGVZfS4gKi9cbmV4cG9ydCBjbGFzcyBTY2FsZVRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZTIgaW1wbGVtZW50cyBCb25lVGltZWxpbmUge1xuXHRib25lSW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIGJvbmVJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsXG5cdFx0XHRQcm9wZXJ0eS5zY2FsZVggKyBcInxcIiArIGJvbmVJbmRleCxcblx0XHRcdFByb3BlcnR5LnNjYWxlWSArIFwifFwiICsgYm9uZUluZGV4XG5cdFx0KTtcblx0XHR0aGlzLmJvbmVJbmRleCA9IGJvbmVJbmRleDtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgYm9uZSA9IHNrZWxldG9uLmJvbmVzW3RoaXMuYm9uZUluZGV4XTtcblx0XHRpZiAoIWJvbmUuYWN0aXZlKSByZXR1cm47XG5cblx0XHRsZXQgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRib25lLnNjYWxlWCA9IGJvbmUuZGF0YS5zY2FsZVg7XG5cdFx0XHRcdFx0Ym9uZS5zY2FsZVkgPSBib25lLmRhdGEuc2NhbGVZO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdFx0XHRib25lLnNjYWxlWCArPSAoYm9uZS5kYXRhLnNjYWxlWCAtIGJvbmUuc2NhbGVYKSAqIGFscGhhO1xuXHRcdFx0XHRcdGJvbmUuc2NhbGVZICs9IChib25lLmRhdGEuc2NhbGVZIC0gYm9uZS5zY2FsZVkpICogYWxwaGE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHgsIHk7XG5cdFx0bGV0IGkgPSBUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCAzLypFTlRSSUVTKi8pO1xuXHRcdGxldCBjdXJ2ZVR5cGUgPSB0aGlzLmN1cnZlc1tpIC8gMy8qRU5UUklFUyovXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0eCA9IGZyYW1lc1tpICsgMS8qVkFMVUUxKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAyLypWQUxVRTIqL107XG5cdFx0XHRcdGxldCB0ID0gKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgMy8qRU5UUklFUyovXSAtIGJlZm9yZSk7XG5cdFx0XHRcdHggKz0gKGZyYW1lc1tpICsgMy8qRU5UUklFUyovICsgMS8qVkFMVUUxKi9dIC0geCkgKiB0O1xuXHRcdFx0XHR5ICs9IChmcmFtZXNbaSArIDMvKkVOVFJJRVMqLyArIDIvKlZBTFVFMiovXSAtIHkpICogdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDEvKlNURVBQRUQqLzpcblx0XHRcdFx0eCA9IGZyYW1lc1tpICsgMS8qVkFMVUUxKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAyLypWQUxVRTIqL107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0eCA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMS8qVkFMVUUxKi8sIGN1cnZlVHlwZSAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qVkFMVUUyKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovIC0gMi8qQkVaSUVSKi8pO1xuXHRcdH1cblx0XHR4ICo9IGJvbmUuZGF0YS5zY2FsZVg7XG5cdFx0eSAqPSBib25lLmRhdGEuc2NhbGVZO1xuXG5cdFx0aWYgKGFscGhhID09IDEpIHtcblx0XHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5hZGQpIHtcblx0XHRcdFx0Ym9uZS5zY2FsZVggKz0geCAtIGJvbmUuZGF0YS5zY2FsZVg7XG5cdFx0XHRcdGJvbmUuc2NhbGVZICs9IHkgLSBib25lLmRhdGEuc2NhbGVZO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ym9uZS5zY2FsZVggPSB4O1xuXHRcdFx0XHRib25lLnNjYWxlWSA9IHk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBieCA9IDAsIGJ5ID0gMDtcblx0XHRcdGlmIChkaXJlY3Rpb24gPT0gTWl4RGlyZWN0aW9uLm1peE91dCkge1xuXHRcdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRcdGJ4ID0gYm9uZS5kYXRhLnNjYWxlWDtcblx0XHRcdFx0XHRcdGJ5ID0gYm9uZS5kYXRhLnNjYWxlWTtcblx0XHRcdFx0XHRcdGJvbmUuc2NhbGVYID0gYnggKyAoTWF0aC5hYnMoeCkgKiBNYXRoVXRpbHMuc2lnbnVtKGJ4KSAtIGJ4KSAqIGFscGhhO1xuXHRcdFx0XHRcdFx0Ym9uZS5zY2FsZVkgPSBieSArIChNYXRoLmFicyh5KSAqIE1hdGhVdGlscy5zaWdudW0oYnkpIC0gYnkpICogYWxwaGE7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdGNhc2UgTWl4QmxlbmQucmVwbGFjZTpcblx0XHRcdFx0XHRcdGJ4ID0gYm9uZS5zY2FsZVg7XG5cdFx0XHRcdFx0XHRieSA9IGJvbmUuc2NhbGVZO1xuXHRcdFx0XHRcdFx0Ym9uZS5zY2FsZVggPSBieCArIChNYXRoLmFicyh4KSAqIE1hdGhVdGlscy5zaWdudW0oYngpIC0gYngpICogYWxwaGE7XG5cdFx0XHRcdFx0XHRib25lLnNjYWxlWSA9IGJ5ICsgKE1hdGguYWJzKHkpICogTWF0aFV0aWxzLnNpZ251bShieSkgLSBieSkgKiBhbHBoYTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgTWl4QmxlbmQuYWRkOlxuXHRcdFx0XHRcdFx0Ym9uZS5zY2FsZVggKz0gKHggLSBib25lLmRhdGEuc2NhbGVYKSAqIGFscGhhO1xuXHRcdFx0XHRcdFx0Ym9uZS5zY2FsZVkgKz0gKHkgLSBib25lLmRhdGEuc2NhbGVZKSAqIGFscGhhO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRcdGJ4ID0gTWF0aC5hYnMoYm9uZS5kYXRhLnNjYWxlWCkgKiBNYXRoVXRpbHMuc2lnbnVtKHgpO1xuXHRcdFx0XHRcdFx0YnkgPSBNYXRoLmFicyhib25lLmRhdGEuc2NhbGVZKSAqIE1hdGhVdGlscy5zaWdudW0oeSk7XG5cdFx0XHRcdFx0XHRib25lLnNjYWxlWCA9IGJ4ICsgKHggLSBieCkgKiBhbHBoYTtcblx0XHRcdFx0XHRcdGJvbmUuc2NhbGVZID0gYnkgKyAoeSAtIGJ5KSAqIGFscGhhO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdFx0XHRjYXNlIE1peEJsZW5kLnJlcGxhY2U6XG5cdFx0XHRcdFx0XHRieCA9IE1hdGguYWJzKGJvbmUuc2NhbGVYKSAqIE1hdGhVdGlscy5zaWdudW0oeCk7XG5cdFx0XHRcdFx0XHRieSA9IE1hdGguYWJzKGJvbmUuc2NhbGVZKSAqIE1hdGhVdGlscy5zaWdudW0oeSk7XG5cdFx0XHRcdFx0XHRib25lLnNjYWxlWCA9IGJ4ICsgKHggLSBieCkgKiBhbHBoYTtcblx0XHRcdFx0XHRcdGJvbmUuc2NhbGVZID0gYnkgKyAoeSAtIGJ5KSAqIGFscGhhO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5hZGQ6XG5cdFx0XHRcdFx0XHRib25lLnNjYWxlWCArPSAoeCAtIGJvbmUuZGF0YS5zY2FsZVgpICogYWxwaGE7XG5cdFx0XHRcdFx0XHRib25lLnNjYWxlWSArPSAoeSAtIGJvbmUuZGF0YS5zY2FsZVkpICogYWxwaGE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBib25lJ3MgbG9jYWwge0BsaW5rIEJvbmUjc2NhbGVYKX0gYW5kIHtAbGluayBCb25lI3NjYWxlWX0uICovXG5leHBvcnQgY2xhc3MgU2NhbGVYVGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lMSBpbXBsZW1lbnRzIEJvbmVUaW1lbGluZSB7XG5cdGJvbmVJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgYm9uZUluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBiZXppZXJDb3VudCwgUHJvcGVydHkuc2NhbGVYICsgXCJ8XCIgKyBib25lSW5kZXgpO1xuXHRcdHRoaXMuYm9uZUluZGV4ID0gYm9uZUluZGV4O1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBldmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBib25lID0gc2tlbGV0b24uYm9uZXNbdGhpcy5ib25lSW5kZXhdO1xuXHRcdGlmIChib25lLmFjdGl2ZSkgYm9uZS5zY2FsZVggPSB0aGlzLmdldFNjYWxlVmFsdWUodGltZSwgYWxwaGEsIGJsZW5kLCBkaXJlY3Rpb24sIGJvbmUuc2NhbGVYLCBib25lLmRhdGEuc2NhbGVYKTtcblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIGJvbmUncyBsb2NhbCB7QGxpbmsgQm9uZSNzY2FsZVgpfSBhbmQge0BsaW5rIEJvbmUjc2NhbGVZfS4gKi9cbmV4cG9ydCBjbGFzcyBTY2FsZVlUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUxIGltcGxlbWVudHMgQm9uZVRpbWVsaW5lIHtcblx0Ym9uZUluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBib25lSW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBQcm9wZXJ0eS5zY2FsZVkgKyBcInxcIiArIGJvbmVJbmRleCk7XG5cdFx0dGhpcy5ib25lSW5kZXggPSBib25lSW5kZXg7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IGJvbmUgPSBza2VsZXRvbi5ib25lc1t0aGlzLmJvbmVJbmRleF07XG5cdFx0aWYgKGJvbmUuYWN0aXZlKSBib25lLnNjYWxlWSA9IHRoaXMuZ2V0U2NhbGVWYWx1ZSh0aW1lLCBhbHBoYSwgYmxlbmQsIGRpcmVjdGlvbiwgYm9uZS5zY2FsZVksIGJvbmUuZGF0YS5zY2FsZVkpO1xuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgYm9uZSdzIGxvY2FsIHtAbGluayBCb25lI3NoZWFyWH0gYW5kIHtAbGluayBCb25lI3NoZWFyWX0uICovXG5leHBvcnQgY2xhc3MgU2hlYXJUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUyIGltcGxlbWVudHMgQm9uZVRpbWVsaW5lIHtcblx0Ym9uZUluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBib25lSW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LFxuXHRcdFx0UHJvcGVydHkuc2hlYXJYICsgXCJ8XCIgKyBib25lSW5kZXgsXG5cdFx0XHRQcm9wZXJ0eS5zaGVhclkgKyBcInxcIiArIGJvbmVJbmRleFxuXHRcdCk7XG5cdFx0dGhpcy5ib25lSW5kZXggPSBib25lSW5kZXg7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IGJvbmUgPSBza2VsZXRvbi5ib25lc1t0aGlzLmJvbmVJbmRleF07XG5cdFx0aWYgKCFib25lLmFjdGl2ZSkgcmV0dXJuO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGlmICh0aW1lIDwgZnJhbWVzWzBdKSB7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0Ym9uZS5zaGVhclggPSBib25lLmRhdGEuc2hlYXJYO1xuXHRcdFx0XHRcdGJvbmUuc2hlYXJZID0gYm9uZS5kYXRhLnNoZWFyWTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdFx0Ym9uZS5zaGVhclggKz0gKGJvbmUuZGF0YS5zaGVhclggLSBib25lLnNoZWFyWCkgKiBhbHBoYTtcblx0XHRcdFx0XHRib25lLnNoZWFyWSArPSAoYm9uZS5kYXRhLnNoZWFyWSAtIGJvbmUuc2hlYXJZKSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB4ID0gMCwgeSA9IDA7XG5cdFx0bGV0IGkgPSBUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCAzLypFTlRSSUVTKi8pO1xuXHRcdGxldCBjdXJ2ZVR5cGUgPSB0aGlzLmN1cnZlc1tpIC8gMy8qRU5UUklFUyovXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0eCA9IGZyYW1lc1tpICsgMS8qVkFMVUUxKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAyLypWQUxVRTIqL107XG5cdFx0XHRcdGxldCB0ID0gKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgMy8qRU5UUklFUyovXSAtIGJlZm9yZSk7XG5cdFx0XHRcdHggKz0gKGZyYW1lc1tpICsgMy8qRU5UUklFUyovICsgMS8qVkFMVUUxKi9dIC0geCkgKiB0O1xuXHRcdFx0XHR5ICs9IChmcmFtZXNbaSArIDMvKkVOVFJJRVMqLyArIDIvKlZBTFVFMiovXSAtIHkpICogdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDEvKlNURVBQRUQqLzpcblx0XHRcdFx0eCA9IGZyYW1lc1tpICsgMS8qVkFMVUUxKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAyLypWQUxVRTIqL107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0eCA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMS8qVkFMVUUxKi8sIGN1cnZlVHlwZSAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qVkFMVUUyKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovIC0gMi8qQkVaSUVSKi8pO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdGJvbmUuc2hlYXJYID0gYm9uZS5kYXRhLnNoZWFyWCArIHggKiBhbHBoYTtcblx0XHRcdFx0Ym9uZS5zaGVhclkgPSBib25lLmRhdGEuc2hlYXJZICsgeSAqIGFscGhhO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRjYXNlIE1peEJsZW5kLnJlcGxhY2U6XG5cdFx0XHRcdGJvbmUuc2hlYXJYICs9IChib25lLmRhdGEuc2hlYXJYICsgeCAtIGJvbmUuc2hlYXJYKSAqIGFscGhhO1xuXHRcdFx0XHRib25lLnNoZWFyWSArPSAoYm9uZS5kYXRhLnNoZWFyWSArIHkgLSBib25lLnNoZWFyWSkgKiBhbHBoYTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1peEJsZW5kLmFkZDpcblx0XHRcdFx0Ym9uZS5zaGVhclggKz0geCAqIGFscGhhO1xuXHRcdFx0XHRib25lLnNoZWFyWSArPSB5ICogYWxwaGE7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgYm9uZSdzIGxvY2FsIHtAbGluayBCb25lI3NoZWFyWH0gYW5kIHtAbGluayBCb25lI3NoZWFyWX0uICovXG5leHBvcnQgY2xhc3MgU2hlYXJYVGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lMSBpbXBsZW1lbnRzIEJvbmVUaW1lbGluZSB7XG5cdGJvbmVJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgYm9uZUluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBiZXppZXJDb3VudCwgUHJvcGVydHkuc2hlYXJYICsgXCJ8XCIgKyBib25lSW5kZXgpO1xuXHRcdHRoaXMuYm9uZUluZGV4ID0gYm9uZUluZGV4O1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBldmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBib25lID0gc2tlbGV0b24uYm9uZXNbdGhpcy5ib25lSW5kZXhdO1xuXHRcdGlmIChib25lLmFjdGl2ZSkgYm9uZS5zaGVhclggPSB0aGlzLmdldFJlbGF0aXZlVmFsdWUodGltZSwgYWxwaGEsIGJsZW5kLCBib25lLnNoZWFyWCwgYm9uZS5kYXRhLnNoZWFyWCk7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBib25lJ3MgbG9jYWwge0BsaW5rIEJvbmUjc2hlYXJYfSBhbmQge0BsaW5rIEJvbmUjc2hlYXJZfS4gKi9cbmV4cG9ydCBjbGFzcyBTaGVhcllUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUxIGltcGxlbWVudHMgQm9uZVRpbWVsaW5lIHtcblx0Ym9uZUluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBib25lSW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBQcm9wZXJ0eS5zaGVhclkgKyBcInxcIiArIGJvbmVJbmRleCk7XG5cdFx0dGhpcy5ib25lSW5kZXggPSBib25lSW5kZXg7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IGJvbmUgPSBza2VsZXRvbi5ib25lc1t0aGlzLmJvbmVJbmRleF07XG5cdFx0aWYgKGJvbmUuYWN0aXZlKSBib25lLnNoZWFyWSA9IHRoaXMuZ2V0UmVsYXRpdmVWYWx1ZSh0aW1lLCBhbHBoYSwgYmxlbmQsIGJvbmUuc2hlYXJZLCBib25lLmRhdGEuc2hlYXJZKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5oZXJpdFRpbWVsaW5lIGV4dGVuZHMgVGltZWxpbmUgaW1wbGVtZW50cyBCb25lVGltZWxpbmUge1xuXHRib25lSW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJvbmVJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgW1Byb3BlcnR5LmluaGVyaXQgKyBcInxcIiArIGJvbmVJbmRleF0pO1xuXHRcdHRoaXMuYm9uZUluZGV4ID0gYm9uZUluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldEZyYW1lRW50cmllcyAoKSB7XG5cdFx0cmV0dXJuIDIvKkVOVFJJRVMqLztcblx0fVxuXG5cdC8qKiBTZXRzIHRoZSB0cmFuc2Zvcm0gbW9kZSBmb3IgdGhlIHNwZWNpZmllZCBmcmFtZS5cblx0ICogQHBhcmFtIGZyYW1lIEJldHdlZW4gMCBhbmQgPGNvZGU+ZnJhbWVDb3VudDwvY29kZT4sIGluY2x1c2l2ZS5cblx0ICogQHBhcmFtIHRpbWUgVGhlIGZyYW1lIHRpbWUgaW4gc2Vjb25kcy4gKi9cblx0cHVibGljIHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGluaGVyaXQ6IEluaGVyaXQpIHtcblx0XHRmcmFtZSAqPSAyLypFTlRSSUVTKi87XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWVdID0gdGltZTtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDEvKklOSEVSSVQqL10gPSBpbmhlcml0O1xuXHR9XG5cblx0cHVibGljIGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgYm9uZSA9IHNrZWxldG9uLmJvbmVzW3RoaXMuYm9uZUluZGV4XTtcblx0XHRpZiAoIWJvbmUuYWN0aXZlKSByZXR1cm47XG5cblx0XHRpZiAoZGlyZWN0aW9uID09IE1peERpcmVjdGlvbi5taXhPdXQpIHtcblx0XHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5zZXR1cCkgYm9uZS5pbmhlcml0ID0gYm9uZS5kYXRhLmluaGVyaXQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGlmICh0aW1lIDwgZnJhbWVzWzBdKSB7XG5cdFx0XHRpZiAoYmxlbmQgPT0gTWl4QmxlbmQuc2V0dXAgfHwgYmxlbmQgPT0gTWl4QmxlbmQuZmlyc3QpIGJvbmUuaW5oZXJpdCA9IGJvbmUuZGF0YS5pbmhlcml0O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRib25lLmluaGVyaXQgPSB0aGlzLmZyYW1lc1tUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCAyLypFTlRSSUVTKi8pICsgMS8qSU5IRVJJVCovXTtcblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIHNsb3QncyB7QGxpbmsgU2xvdCNjb2xvcn0uICovXG5leHBvcnQgY2xhc3MgUkdCQVRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZSBpbXBsZW1lbnRzIFNsb3RUaW1lbGluZSB7XG5cdHNsb3RJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgc2xvdEluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBiZXppZXJDb3VudCwgW1xuXHRcdFx0UHJvcGVydHkucmdiICsgXCJ8XCIgKyBzbG90SW5kZXgsXG5cdFx0XHRQcm9wZXJ0eS5hbHBoYSArIFwifFwiICsgc2xvdEluZGV4XG5cdFx0XSk7XG5cdFx0dGhpcy5zbG90SW5kZXggPSBzbG90SW5kZXg7XG5cdH1cblxuXHRnZXRGcmFtZUVudHJpZXMgKCkge1xuXHRcdHJldHVybiA1LypFTlRSSUVTKi87XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgdGltZSBpbiBzZWNvbmRzLCByZWQsIGdyZWVuLCBibHVlLCBhbmQgYWxwaGEgZm9yIHRoZSBzcGVjaWZpZWQga2V5IGZyYW1lLiAqL1xuXHRzZXRGcmFtZSAoZnJhbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCByOiBudW1iZXIsIGc6IG51bWJlciwgYjogbnVtYmVyLCBhOiBudW1iZXIpIHtcblx0XHRmcmFtZSAqPSA1LypFTlRSSUVTKi87XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWVdID0gdGltZTtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDEvKlIqL10gPSByO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMi8qRyovXSA9IGc7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyAzLypCKi9dID0gYjtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDQvKkEqL10gPSBhO1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBldmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBzbG90ID0gc2tlbGV0b24uc2xvdHNbdGhpcy5zbG90SW5kZXhdO1xuXHRcdGlmICghc2xvdC5ib25lLmFjdGl2ZSkgcmV0dXJuO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGxldCBjb2xvciA9IHNsb3QuY29sb3I7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdGxldCBzZXR1cCA9IHNsb3QuZGF0YS5jb2xvcjtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRjb2xvci5zZXRGcm9tQ29sb3Ioc2V0dXApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdFx0XHRjb2xvci5hZGQoKHNldHVwLnIgLSBjb2xvci5yKSAqIGFscGhhLCAoc2V0dXAuZyAtIGNvbG9yLmcpICogYWxwaGEsIChzZXR1cC5iIC0gY29sb3IuYikgKiBhbHBoYSxcblx0XHRcdFx0XHRcdChzZXR1cC5hIC0gY29sb3IuYSkgKiBhbHBoYSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHIgPSAwLCBnID0gMCwgYiA9IDAsIGEgPSAwO1xuXHRcdGxldCBpID0gVGltZWxpbmUuc2VhcmNoKGZyYW1lcywgdGltZSwgNS8qRU5UUklFUyovKTtcblx0XHRsZXQgY3VydmVUeXBlID0gdGhpcy5jdXJ2ZXNbaSAvIDUvKkVOVFJJRVMqL107XG5cdFx0c3dpdGNoIChjdXJ2ZVR5cGUpIHtcblx0XHRcdGNhc2UgMC8qTElORUFSKi86XG5cdFx0XHRcdGxldCBiZWZvcmUgPSBmcmFtZXNbaV07XG5cdFx0XHRcdHIgPSBmcmFtZXNbaSArIDEvKlIqL107XG5cdFx0XHRcdGcgPSBmcmFtZXNbaSArIDIvKkcqL107XG5cdFx0XHRcdGIgPSBmcmFtZXNbaSArIDMvKkIqL107XG5cdFx0XHRcdGEgPSBmcmFtZXNbaSArIDQvKkEqL107XG5cdFx0XHRcdGxldCB0ID0gKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgNS8qRU5UUklFUyovXSAtIGJlZm9yZSk7XG5cdFx0XHRcdHIgKz0gKGZyYW1lc1tpICsgNS8qRU5UUklFUyovICsgMS8qUiovXSAtIHIpICogdDtcblx0XHRcdFx0ZyArPSAoZnJhbWVzW2kgKyA1LypFTlRSSUVTKi8gKyAyLypHKi9dIC0gZykgKiB0O1xuXHRcdFx0XHRiICs9IChmcmFtZXNbaSArIDUvKkVOVFJJRVMqLyArIDMvKkIqL10gLSBiKSAqIHQ7XG5cdFx0XHRcdGEgKz0gKGZyYW1lc1tpICsgNS8qRU5UUklFUyovICsgNC8qQSovXSAtIGEpICogdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDEvKlNURVBQRUQqLzpcblx0XHRcdFx0ciA9IGZyYW1lc1tpICsgMS8qUiovXTtcblx0XHRcdFx0ZyA9IGZyYW1lc1tpICsgMi8qRyovXTtcblx0XHRcdFx0YiA9IGZyYW1lc1tpICsgMy8qQiovXTtcblx0XHRcdFx0YSA9IGZyYW1lc1tpICsgNC8qQSovXTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAxLypSKi8sIGN1cnZlVHlwZSAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0ZyA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qRyovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0YiA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMy8qQiovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDIgLSAyLypCRVpJRVIqLyk7XG5cdFx0XHRcdGEgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDQvKkEqLywgY3VydmVUeXBlICsgMTgvKkJFWklFUl9TSVpFKi8gKiAzIC0gMi8qQkVaSUVSKi8pO1xuXHRcdH1cblx0XHRpZiAoYWxwaGEgPT0gMSlcblx0XHRcdGNvbG9yLnNldChyLCBnLCBiLCBhKTtcblx0XHRlbHNlIHtcblx0XHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5zZXR1cCkgY29sb3Iuc2V0RnJvbUNvbG9yKHNsb3QuZGF0YS5jb2xvcik7XG5cdFx0XHRjb2xvci5hZGQoKHIgLSBjb2xvci5yKSAqIGFscGhhLCAoZyAtIGNvbG9yLmcpICogYWxwaGEsIChiIC0gY29sb3IuYikgKiBhbHBoYSwgKGEgLSBjb2xvci5hKSAqIGFscGhhKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBzbG90J3Mge0BsaW5rIFNsb3QjY29sb3J9LiAqL1xuZXhwb3J0IGNsYXNzIFJHQlRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZSBpbXBsZW1lbnRzIFNsb3RUaW1lbGluZSB7XG5cdHNsb3RJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgc2xvdEluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBiZXppZXJDb3VudCwgW1xuXHRcdFx0UHJvcGVydHkucmdiICsgXCJ8XCIgKyBzbG90SW5kZXhcblx0XHRdKTtcblx0XHR0aGlzLnNsb3RJbmRleCA9IHNsb3RJbmRleDtcblx0fVxuXG5cdGdldEZyYW1lRW50cmllcyAoKSB7XG5cdFx0cmV0dXJuIDQvKkVOVFJJRVMqLztcblx0fVxuXG5cdC8qKiBTZXRzIHRoZSB0aW1lIGluIHNlY29uZHMsIHJlZCwgZ3JlZW4sIGJsdWUsIGFuZCBhbHBoYSBmb3IgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIHI6IG51bWJlciwgZzogbnVtYmVyLCBiOiBudW1iZXIpIHtcblx0XHRmcmFtZSA8PD0gMjtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMS8qUiovXSA9IHI7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyAyLypHKi9dID0gZztcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDMvKkIqL10gPSBiO1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBldmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBzbG90ID0gc2tlbGV0b24uc2xvdHNbdGhpcy5zbG90SW5kZXhdO1xuXHRcdGlmICghc2xvdC5ib25lLmFjdGl2ZSkgcmV0dXJuO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGxldCBjb2xvciA9IHNsb3QuY29sb3I7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdGxldCBzZXR1cCA9IHNsb3QuZGF0YS5jb2xvcjtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRjb2xvci5yID0gc2V0dXAucjtcblx0XHRcdFx0XHRjb2xvci5nID0gc2V0dXAuZztcblx0XHRcdFx0XHRjb2xvci5iID0gc2V0dXAuYjtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdFx0Y29sb3IuciArPSAoc2V0dXAuciAtIGNvbG9yLnIpICogYWxwaGE7XG5cdFx0XHRcdFx0Y29sb3IuZyArPSAoc2V0dXAuZyAtIGNvbG9yLmcpICogYWxwaGE7XG5cdFx0XHRcdFx0Y29sb3IuYiArPSAoc2V0dXAuYiAtIGNvbG9yLmIpICogYWxwaGE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHIgPSAwLCBnID0gMCwgYiA9IDA7XG5cdFx0bGV0IGkgPSBUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCA0LypFTlRSSUVTKi8pO1xuXHRcdGxldCBjdXJ2ZVR5cGUgPSB0aGlzLmN1cnZlc1tpID4+IDJdO1xuXHRcdHN3aXRjaCAoY3VydmVUeXBlKSB7XG5cdFx0XHRjYXNlIDAvKkxJTkVBUiovOlxuXHRcdFx0XHRsZXQgYmVmb3JlID0gZnJhbWVzW2ldO1xuXHRcdFx0XHRyID0gZnJhbWVzW2kgKyAxLypSKi9dO1xuXHRcdFx0XHRnID0gZnJhbWVzW2kgKyAyLypHKi9dO1xuXHRcdFx0XHRiID0gZnJhbWVzW2kgKyAzLypCKi9dO1xuXHRcdFx0XHRsZXQgdCA9ICh0aW1lIC0gYmVmb3JlKSAvIChmcmFtZXNbaSArIDQvKkVOVFJJRVMqL10gLSBiZWZvcmUpO1xuXHRcdFx0XHRyICs9IChmcmFtZXNbaSArIDQvKkVOVFJJRVMqLyArIDEvKlIqL10gLSByKSAqIHQ7XG5cdFx0XHRcdGcgKz0gKGZyYW1lc1tpICsgNC8qRU5UUklFUyovICsgMi8qRyovXSAtIGcpICogdDtcblx0XHRcdFx0YiArPSAoZnJhbWVzW2kgKyA0LypFTlRSSUVTKi8gKyAzLypCKi9dIC0gYikgKiB0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgMS8qU1RFUFBFRCovOlxuXHRcdFx0XHRyID0gZnJhbWVzW2kgKyAxLypSKi9dO1xuXHRcdFx0XHRnID0gZnJhbWVzW2kgKyAyLypHKi9dO1xuXHRcdFx0XHRiID0gZnJhbWVzW2kgKyAzLypCKi9dO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHIgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDEvKlIqLywgY3VydmVUeXBlIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRnID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAyLypHKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRiID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAzLypCKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogMiAtIDIvKkJFWklFUiovKTtcblx0XHR9XG5cdFx0aWYgKGFscGhhID09IDEpIHtcblx0XHRcdGNvbG9yLnIgPSByO1xuXHRcdFx0Y29sb3IuZyA9IGc7XG5cdFx0XHRjb2xvci5iID0gYjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSB7XG5cdFx0XHRcdGxldCBzZXR1cCA9IHNsb3QuZGF0YS5jb2xvcjtcblx0XHRcdFx0Y29sb3IuciA9IHNldHVwLnI7XG5cdFx0XHRcdGNvbG9yLmcgPSBzZXR1cC5nO1xuXHRcdFx0XHRjb2xvci5iID0gc2V0dXAuYjtcblx0XHRcdH1cblx0XHRcdGNvbG9yLnIgKz0gKHIgLSBjb2xvci5yKSAqIGFscGhhO1xuXHRcdFx0Y29sb3IuZyArPSAoZyAtIGNvbG9yLmcpICogYWxwaGE7XG5cdFx0XHRjb2xvci5iICs9IChiIC0gY29sb3IuYikgKiBhbHBoYTtcblx0XHR9XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBib25lJ3MgbG9jYWwge0BsaW5rIEJvbmUjc2hlYXJYfSBhbmQge0BsaW5rIEJvbmUjc2hlYXJZfS4gKi9cbmV4cG9ydCBjbGFzcyBBbHBoYVRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZTEgaW1wbGVtZW50cyBTbG90VGltZWxpbmUge1xuXHRzbG90SW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIHNsb3RJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFByb3BlcnR5LmFscGhhICsgXCJ8XCIgKyBzbG90SW5kZXgpO1xuXHRcdHRoaXMuc2xvdEluZGV4ID0gc2xvdEluZGV4O1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBldmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBzbG90ID0gc2tlbGV0b24uc2xvdHNbdGhpcy5zbG90SW5kZXhdO1xuXHRcdGlmICghc2xvdC5ib25lLmFjdGl2ZSkgcmV0dXJuO1xuXG5cdFx0bGV0IGNvbG9yID0gc2xvdC5jb2xvcjtcblx0XHRpZiAodGltZSA8IHRoaXMuZnJhbWVzWzBdKSB7XG5cdFx0XHRsZXQgc2V0dXAgPSBzbG90LmRhdGEuY29sb3I7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0Y29sb3IuYSA9IHNldHVwLmE7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdGNvbG9yLmEgKz0gKHNldHVwLmEgLSBjb2xvci5hKSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhID0gdGhpcy5nZXRDdXJ2ZVZhbHVlKHRpbWUpO1xuXHRcdGlmIChhbHBoYSA9PSAxKVxuXHRcdFx0Y29sb3IuYSA9IGE7XG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAoYmxlbmQgPT0gTWl4QmxlbmQuc2V0dXApIGNvbG9yLmEgPSBzbG90LmRhdGEuY29sb3IuYTtcblx0XHRcdGNvbG9yLmEgKz0gKGEgLSBjb2xvci5hKSAqIGFscGhhO1xuXHRcdH1cblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIHNsb3QncyB7QGxpbmsgU2xvdCNjb2xvcn0gYW5kIHtAbGluayBTbG90I2RhcmtDb2xvcn0gZm9yIHR3byBjb2xvciB0aW50aW5nLiAqL1xuZXhwb3J0IGNsYXNzIFJHQkEyVGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lIGltcGxlbWVudHMgU2xvdFRpbWVsaW5lIHtcblx0c2xvdEluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBzbG90SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBbXG5cdFx0XHRQcm9wZXJ0eS5yZ2IgKyBcInxcIiArIHNsb3RJbmRleCxcblx0XHRcdFByb3BlcnR5LmFscGhhICsgXCJ8XCIgKyBzbG90SW5kZXgsXG5cdFx0XHRQcm9wZXJ0eS5yZ2IyICsgXCJ8XCIgKyBzbG90SW5kZXhcblx0XHRdKTtcblx0XHR0aGlzLnNsb3RJbmRleCA9IHNsb3RJbmRleDtcblx0fVxuXG5cdGdldEZyYW1lRW50cmllcyAoKSB7XG5cdFx0cmV0dXJuIDgvKkVOVFJJRVMqLztcblx0fVxuXG5cdC8qKiBTZXRzIHRoZSB0aW1lIGluIHNlY29uZHMsIGxpZ2h0LCBhbmQgZGFyayBjb2xvcnMgZm9yIHRoZSBzcGVjaWZpZWQga2V5IGZyYW1lLiAqL1xuXHRzZXRGcmFtZSAoZnJhbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCByOiBudW1iZXIsIGc6IG51bWJlciwgYjogbnVtYmVyLCBhOiBudW1iZXIsIHIyOiBudW1iZXIsIGcyOiBudW1iZXIsIGIyOiBudW1iZXIpIHtcblx0XHRmcmFtZSA8PD0gMztcblx0XHR0aGlzLmZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMS8qUiovXSA9IHI7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyAyLypHKi9dID0gZztcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDMvKkIqL10gPSBiO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgNC8qQSovXSA9IGE7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyA1LypSMiovXSA9IHIyO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgNi8qRzIqL10gPSBnMjtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDcvKkIyKi9dID0gYjI7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IHNsb3QgPSBza2VsZXRvbi5zbG90c1t0aGlzLnNsb3RJbmRleF07XG5cdFx0aWYgKCFzbG90LmJvbmUuYWN0aXZlKSByZXR1cm47XG5cblx0XHRsZXQgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0bGV0IGxpZ2h0ID0gc2xvdC5jb2xvciwgZGFyayA9IHNsb3QuZGFya0NvbG9yITtcblx0XHRpZiAodGltZSA8IGZyYW1lc1swXSkge1xuXHRcdFx0bGV0IHNldHVwTGlnaHQgPSBzbG90LmRhdGEuY29sb3IsIHNldHVwRGFyayA9IHNsb3QuZGF0YS5kYXJrQ29sb3IhO1xuXHRcdFx0c3dpdGNoIChibGVuZCkge1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLnNldHVwOlxuXHRcdFx0XHRcdGxpZ2h0LnNldEZyb21Db2xvcihzZXR1cExpZ2h0KTtcblx0XHRcdFx0XHRkYXJrLnIgPSBzZXR1cERhcmsucjtcblx0XHRcdFx0XHRkYXJrLmcgPSBzZXR1cERhcmsuZztcblx0XHRcdFx0XHRkYXJrLmIgPSBzZXR1cERhcmsuYjtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdFx0bGlnaHQuYWRkKChzZXR1cExpZ2h0LnIgLSBsaWdodC5yKSAqIGFscGhhLCAoc2V0dXBMaWdodC5nIC0gbGlnaHQuZykgKiBhbHBoYSwgKHNldHVwTGlnaHQuYiAtIGxpZ2h0LmIpICogYWxwaGEsXG5cdFx0XHRcdFx0XHQoc2V0dXBMaWdodC5hIC0gbGlnaHQuYSkgKiBhbHBoYSk7XG5cdFx0XHRcdFx0ZGFyay5yICs9IChzZXR1cERhcmsuciAtIGRhcmsucikgKiBhbHBoYTtcblx0XHRcdFx0XHRkYXJrLmcgKz0gKHNldHVwRGFyay5nIC0gZGFyay5nKSAqIGFscGhhO1xuXHRcdFx0XHRcdGRhcmsuYiArPSAoc2V0dXBEYXJrLmIgLSBkYXJrLmIpICogYWxwaGE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHIgPSAwLCBnID0gMCwgYiA9IDAsIGEgPSAwLCByMiA9IDAsIGcyID0gMCwgYjIgPSAwO1xuXHRcdGxldCBpID0gVGltZWxpbmUuc2VhcmNoKGZyYW1lcywgdGltZSwgOC8qRU5UUklFUyovKTtcblx0XHRsZXQgY3VydmVUeXBlID0gdGhpcy5jdXJ2ZXNbaSA+PiAzXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0ciA9IGZyYW1lc1tpICsgMS8qUiovXTtcblx0XHRcdFx0ZyA9IGZyYW1lc1tpICsgMi8qRyovXTtcblx0XHRcdFx0YiA9IGZyYW1lc1tpICsgMy8qQiovXTtcblx0XHRcdFx0YSA9IGZyYW1lc1tpICsgNC8qQSovXTtcblx0XHRcdFx0cjIgPSBmcmFtZXNbaSArIDUvKlIyKi9dO1xuXHRcdFx0XHRnMiA9IGZyYW1lc1tpICsgNi8qRzIqL107XG5cdFx0XHRcdGIyID0gZnJhbWVzW2kgKyA3LypCMiovXTtcblx0XHRcdFx0bGV0IHQgPSAodGltZSAtIGJlZm9yZSkgLyAoZnJhbWVzW2kgKyA4LypFTlRSSUVTKi9dIC0gYmVmb3JlKTtcblx0XHRcdFx0ciArPSAoZnJhbWVzW2kgKyA4LypFTlRSSUVTKi8gKyAxLypSKi9dIC0gcikgKiB0O1xuXHRcdFx0XHRnICs9IChmcmFtZXNbaSArIDgvKkVOVFJJRVMqLyArIDIvKkcqL10gLSBnKSAqIHQ7XG5cdFx0XHRcdGIgKz0gKGZyYW1lc1tpICsgOC8qRU5UUklFUyovICsgMy8qQiovXSAtIGIpICogdDtcblx0XHRcdFx0YSArPSAoZnJhbWVzW2kgKyA4LypFTlRSSUVTKi8gKyA0LypBKi9dIC0gYSkgKiB0O1xuXHRcdFx0XHRyMiArPSAoZnJhbWVzW2kgKyA4LypFTlRSSUVTKi8gKyA1LypSMiovXSAtIHIyKSAqIHQ7XG5cdFx0XHRcdGcyICs9IChmcmFtZXNbaSArIDgvKkVOVFJJRVMqLyArIDYvKkcyKi9dIC0gZzIpICogdDtcblx0XHRcdFx0YjIgKz0gKGZyYW1lc1tpICsgOC8qRU5UUklFUyovICsgNy8qQjIqL10gLSBiMikgKiB0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgMS8qU1RFUFBFRCovOlxuXHRcdFx0XHRyID0gZnJhbWVzW2kgKyAxLypSKi9dO1xuXHRcdFx0XHRnID0gZnJhbWVzW2kgKyAyLypHKi9dO1xuXHRcdFx0XHRiID0gZnJhbWVzW2kgKyAzLypCKi9dO1xuXHRcdFx0XHRhID0gZnJhbWVzW2kgKyA0LypBKi9dO1xuXHRcdFx0XHRyMiA9IGZyYW1lc1tpICsgNS8qUjIqL107XG5cdFx0XHRcdGcyID0gZnJhbWVzW2kgKyA2LypHMiovXTtcblx0XHRcdFx0YjIgPSBmcmFtZXNbaSArIDcvKkIyKi9dO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHIgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDEvKlIqLywgY3VydmVUeXBlIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRnID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAyLypHKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRiID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAzLypCKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogMiAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0YSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgNC8qQSovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDMgLSAyLypCRVpJRVIqLyk7XG5cdFx0XHRcdHIyID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCA1LypSMiovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDQgLSAyLypCRVpJRVIqLyk7XG5cdFx0XHRcdGcyID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCA2LypHMiovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDUgLSAyLypCRVpJRVIqLyk7XG5cdFx0XHRcdGIyID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCA3LypCMiovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDYgLSAyLypCRVpJRVIqLyk7XG5cdFx0fVxuXG5cdFx0aWYgKGFscGhhID09IDEpIHtcblx0XHRcdGxpZ2h0LnNldChyLCBnLCBiLCBhKTtcblx0XHRcdGRhcmsuciA9IHIyO1xuXHRcdFx0ZGFyay5nID0gZzI7XG5cdFx0XHRkYXJrLmIgPSBiMjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSB7XG5cdFx0XHRcdGxpZ2h0LnNldEZyb21Db2xvcihzbG90LmRhdGEuY29sb3IpO1xuXHRcdFx0XHRsZXQgc2V0dXBEYXJrID0gc2xvdC5kYXRhLmRhcmtDb2xvciE7XG5cdFx0XHRcdGRhcmsuciA9IHNldHVwRGFyay5yO1xuXHRcdFx0XHRkYXJrLmcgPSBzZXR1cERhcmsuZztcblx0XHRcdFx0ZGFyay5iID0gc2V0dXBEYXJrLmI7XG5cdFx0XHR9XG5cdFx0XHRsaWdodC5hZGQoKHIgLSBsaWdodC5yKSAqIGFscGhhLCAoZyAtIGxpZ2h0LmcpICogYWxwaGEsIChiIC0gbGlnaHQuYikgKiBhbHBoYSwgKGEgLSBsaWdodC5hKSAqIGFscGhhKTtcblx0XHRcdGRhcmsuciArPSAocjIgLSBkYXJrLnIpICogYWxwaGE7XG5cdFx0XHRkYXJrLmcgKz0gKGcyIC0gZGFyay5nKSAqIGFscGhhO1xuXHRcdFx0ZGFyay5iICs9IChiMiAtIGRhcmsuYikgKiBhbHBoYTtcblx0XHR9XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBzbG90J3Mge0BsaW5rIFNsb3QjY29sb3J9IGFuZCB7QGxpbmsgU2xvdCNkYXJrQ29sb3J9IGZvciB0d28gY29sb3IgdGludGluZy4gKi9cbmV4cG9ydCBjbGFzcyBSR0IyVGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lIGltcGxlbWVudHMgU2xvdFRpbWVsaW5lIHtcblx0c2xvdEluZGV4ID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBzbG90SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBbXG5cdFx0XHRQcm9wZXJ0eS5yZ2IgKyBcInxcIiArIHNsb3RJbmRleCxcblx0XHRcdFByb3BlcnR5LnJnYjIgKyBcInxcIiArIHNsb3RJbmRleFxuXHRcdF0pO1xuXHRcdHRoaXMuc2xvdEluZGV4ID0gc2xvdEluZGV4O1xuXHR9XG5cblx0Z2V0RnJhbWVFbnRyaWVzICgpIHtcblx0XHRyZXR1cm4gNy8qRU5UUklFUyovO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIHRpbWUgaW4gc2Vjb25kcywgbGlnaHQsIGFuZCBkYXJrIGNvbG9ycyBmb3IgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIHI6IG51bWJlciwgZzogbnVtYmVyLCBiOiBudW1iZXIsIHIyOiBudW1iZXIsIGcyOiBudW1iZXIsIGIyOiBudW1iZXIpIHtcblx0XHRmcmFtZSAqPSA3LypFTlRSSUVTKi87XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWVdID0gdGltZTtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDEvKlIqL10gPSByO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMi8qRyovXSA9IGc7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyAzLypCKi9dID0gYjtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZSArIDQvKlIyKi9dID0gcjI7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyA1LypHMiovXSA9IGcyO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgNi8qQjIqL10gPSBiMjtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgc2xvdCA9IHNrZWxldG9uLnNsb3RzW3RoaXMuc2xvdEluZGV4XTtcblx0XHRpZiAoIXNsb3QuYm9uZS5hY3RpdmUpIHJldHVybjtcblxuXHRcdGxldCBmcmFtZXMgPSB0aGlzLmZyYW1lcztcblx0XHRsZXQgbGlnaHQgPSBzbG90LmNvbG9yLCBkYXJrID0gc2xvdC5kYXJrQ29sb3IhO1xuXHRcdGlmICh0aW1lIDwgZnJhbWVzWzBdKSB7XG5cdFx0XHRsZXQgc2V0dXBMaWdodCA9IHNsb3QuZGF0YS5jb2xvciwgc2V0dXBEYXJrID0gc2xvdC5kYXRhLmRhcmtDb2xvciE7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0bGlnaHQuciA9IHNldHVwTGlnaHQucjtcblx0XHRcdFx0XHRsaWdodC5nID0gc2V0dXBMaWdodC5nO1xuXHRcdFx0XHRcdGxpZ2h0LmIgPSBzZXR1cExpZ2h0LmI7XG5cdFx0XHRcdFx0ZGFyay5yID0gc2V0dXBEYXJrLnI7XG5cdFx0XHRcdFx0ZGFyay5nID0gc2V0dXBEYXJrLmc7XG5cdFx0XHRcdFx0ZGFyay5iID0gc2V0dXBEYXJrLmI7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdGxpZ2h0LnIgKz0gKHNldHVwTGlnaHQuciAtIGxpZ2h0LnIpICogYWxwaGE7XG5cdFx0XHRcdFx0bGlnaHQuZyArPSAoc2V0dXBMaWdodC5nIC0gbGlnaHQuZykgKiBhbHBoYTtcblx0XHRcdFx0XHRsaWdodC5iICs9IChzZXR1cExpZ2h0LmIgLSBsaWdodC5iKSAqIGFscGhhO1xuXHRcdFx0XHRcdGRhcmsuciArPSAoc2V0dXBEYXJrLnIgLSBkYXJrLnIpICogYWxwaGE7XG5cdFx0XHRcdFx0ZGFyay5nICs9IChzZXR1cERhcmsuZyAtIGRhcmsuZykgKiBhbHBoYTtcblx0XHRcdFx0XHRkYXJrLmIgKz0gKHNldHVwRGFyay5iIC0gZGFyay5iKSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCByID0gMCwgZyA9IDAsIGIgPSAwLCBhID0gMCwgcjIgPSAwLCBnMiA9IDAsIGIyID0gMDtcblx0XHRsZXQgaSA9IFRpbWVsaW5lLnNlYXJjaChmcmFtZXMsIHRpbWUsIDcvKkVOVFJJRVMqLyk7XG5cdFx0bGV0IGN1cnZlVHlwZSA9IHRoaXMuY3VydmVzW2kgLyA3LypFTlRSSUVTKi9dO1xuXHRcdHN3aXRjaCAoY3VydmVUeXBlKSB7XG5cdFx0XHRjYXNlIDAvKkxJTkVBUiovOlxuXHRcdFx0XHRsZXQgYmVmb3JlID0gZnJhbWVzW2ldO1xuXHRcdFx0XHRyID0gZnJhbWVzW2kgKyAxLypSKi9dO1xuXHRcdFx0XHRnID0gZnJhbWVzW2kgKyAyLypHKi9dO1xuXHRcdFx0XHRiID0gZnJhbWVzW2kgKyAzLypCKi9dO1xuXHRcdFx0XHRyMiA9IGZyYW1lc1tpICsgNC8qUjIqL107XG5cdFx0XHRcdGcyID0gZnJhbWVzW2kgKyA1LypHMiovXTtcblx0XHRcdFx0YjIgPSBmcmFtZXNbaSArIDYvKkIyKi9dO1xuXHRcdFx0XHRsZXQgdCA9ICh0aW1lIC0gYmVmb3JlKSAvIChmcmFtZXNbaSArIDcvKkVOVFJJRVMqL10gLSBiZWZvcmUpO1xuXHRcdFx0XHRyICs9IChmcmFtZXNbaSArIDcvKkVOVFJJRVMqLyArIDEvKlIqL10gLSByKSAqIHQ7XG5cdFx0XHRcdGcgKz0gKGZyYW1lc1tpICsgNy8qRU5UUklFUyovICsgMi8qRyovXSAtIGcpICogdDtcblx0XHRcdFx0YiArPSAoZnJhbWVzW2kgKyA3LypFTlRSSUVTKi8gKyAzLypCKi9dIC0gYikgKiB0O1xuXHRcdFx0XHRyMiArPSAoZnJhbWVzW2kgKyA3LypFTlRSSUVTKi8gKyA0LypSMiovXSAtIHIyKSAqIHQ7XG5cdFx0XHRcdGcyICs9IChmcmFtZXNbaSArIDcvKkVOVFJJRVMqLyArIDUvKkcyKi9dIC0gZzIpICogdDtcblx0XHRcdFx0YjIgKz0gKGZyYW1lc1tpICsgNy8qRU5UUklFUyovICsgNi8qQjIqL10gLSBiMikgKiB0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgMS8qU1RFUFBFRCovOlxuXHRcdFx0XHRyID0gZnJhbWVzW2kgKyAxLypSKi9dO1xuXHRcdFx0XHRnID0gZnJhbWVzW2kgKyAyLypHKi9dO1xuXHRcdFx0XHRiID0gZnJhbWVzW2kgKyAzLypCKi9dO1xuXHRcdFx0XHRyMiA9IGZyYW1lc1tpICsgNC8qUjIqL107XG5cdFx0XHRcdGcyID0gZnJhbWVzW2kgKyA1LypHMiovXTtcblx0XHRcdFx0YjIgPSBmcmFtZXNbaSArIDYvKkIyKi9dO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHIgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDEvKlIqLywgY3VydmVUeXBlIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRnID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAyLypHKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRiID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAzLypCKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogMiAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0cjIgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDQvKlIyKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogMyAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0ZzIgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDUvKkcyKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogNCAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0YjIgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDYvKkIyKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogNSAtIDIvKkJFWklFUiovKTtcblx0XHR9XG5cblx0XHRpZiAoYWxwaGEgPT0gMSkge1xuXHRcdFx0bGlnaHQuciA9IHI7XG5cdFx0XHRsaWdodC5nID0gZztcblx0XHRcdGxpZ2h0LmIgPSBiO1xuXHRcdFx0ZGFyay5yID0gcjI7XG5cdFx0XHRkYXJrLmcgPSBnMjtcblx0XHRcdGRhcmsuYiA9IGIyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoYmxlbmQgPT0gTWl4QmxlbmQuc2V0dXApIHtcblx0XHRcdFx0bGV0IHNldHVwTGlnaHQgPSBzbG90LmRhdGEuY29sb3IsIHNldHVwRGFyayA9IHNsb3QuZGF0YS5kYXJrQ29sb3IhO1xuXHRcdFx0XHRsaWdodC5yID0gc2V0dXBMaWdodC5yO1xuXHRcdFx0XHRsaWdodC5nID0gc2V0dXBMaWdodC5nO1xuXHRcdFx0XHRsaWdodC5iID0gc2V0dXBMaWdodC5iO1xuXHRcdFx0XHRkYXJrLnIgPSBzZXR1cERhcmsucjtcblx0XHRcdFx0ZGFyay5nID0gc2V0dXBEYXJrLmc7XG5cdFx0XHRcdGRhcmsuYiA9IHNldHVwRGFyay5iO1xuXHRcdFx0fVxuXHRcdFx0bGlnaHQuciArPSAociAtIGxpZ2h0LnIpICogYWxwaGE7XG5cdFx0XHRsaWdodC5nICs9IChnIC0gbGlnaHQuZykgKiBhbHBoYTtcblx0XHRcdGxpZ2h0LmIgKz0gKGIgLSBsaWdodC5iKSAqIGFscGhhO1xuXHRcdFx0ZGFyay5yICs9IChyMiAtIGRhcmsucikgKiBhbHBoYTtcblx0XHRcdGRhcmsuZyArPSAoZzIgLSBkYXJrLmcpICogYWxwaGE7XG5cdFx0XHRkYXJrLmIgKz0gKGIyIC0gZGFyay5iKSAqIGFscGhhO1xuXHRcdH1cblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIHNsb3QncyB7QGxpbmsgU2xvdCNhdHRhY2htZW50fS4gKi9cbmV4cG9ydCBjbGFzcyBBdHRhY2htZW50VGltZWxpbmUgZXh0ZW5kcyBUaW1lbGluZSBpbXBsZW1lbnRzIFNsb3RUaW1lbGluZSB7XG5cdHNsb3RJbmRleCA9IDA7XG5cblx0LyoqIFRoZSBhdHRhY2htZW50IG5hbWUgZm9yIGVhY2gga2V5IGZyYW1lLiBNYXkgY29udGFpbiBudWxsIHZhbHVlcyB0byBjbGVhciB0aGUgYXR0YWNobWVudC4gKi9cblx0YXR0YWNobWVudE5hbWVzOiBBcnJheTxzdHJpbmcgfCBudWxsPjtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBzbG90SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIFtcblx0XHRcdFByb3BlcnR5LmF0dGFjaG1lbnQgKyBcInxcIiArIHNsb3RJbmRleFxuXHRcdF0pO1xuXHRcdHRoaXMuc2xvdEluZGV4ID0gc2xvdEluZGV4O1xuXHRcdHRoaXMuYXR0YWNobWVudE5hbWVzID0gbmV3IEFycmF5PHN0cmluZz4oZnJhbWVDb3VudCk7XG5cdH1cblxuXHRnZXRGcmFtZUNvdW50ICgpIHtcblx0XHRyZXR1cm4gdGhpcy5mcmFtZXMubGVuZ3RoO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIHRpbWUgaW4gc2Vjb25kcyBhbmQgdGhlIGF0dGFjaG1lbnQgbmFtZSBmb3IgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGF0dGFjaG1lbnROYW1lOiBzdHJpbmcgfCBudWxsKSB7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWVdID0gdGltZTtcblx0XHR0aGlzLmF0dGFjaG1lbnROYW1lc1tmcmFtZV0gPSBhdHRhY2htZW50TmFtZTtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgc2xvdCA9IHNrZWxldG9uLnNsb3RzW3RoaXMuc2xvdEluZGV4XTtcblx0XHRpZiAoIXNsb3QuYm9uZS5hY3RpdmUpIHJldHVybjtcblxuXHRcdGlmIChkaXJlY3Rpb24gPT0gTWl4RGlyZWN0aW9uLm1peE91dCkge1xuXHRcdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSB0aGlzLnNldEF0dGFjaG1lbnQoc2tlbGV0b24sIHNsb3QsIHNsb3QuZGF0YS5hdHRhY2htZW50TmFtZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRpbWUgPCB0aGlzLmZyYW1lc1swXSkge1xuXHRcdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwIHx8IGJsZW5kID09IE1peEJsZW5kLmZpcnN0KSB0aGlzLnNldEF0dGFjaG1lbnQoc2tlbGV0b24sIHNsb3QsIHNsb3QuZGF0YS5hdHRhY2htZW50TmFtZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRBdHRhY2htZW50KHNrZWxldG9uLCBzbG90LCB0aGlzLmF0dGFjaG1lbnROYW1lc1tUaW1lbGluZS5zZWFyY2gxKHRoaXMuZnJhbWVzLCB0aW1lKV0pO1xuXHR9XG5cblx0c2V0QXR0YWNobWVudCAoc2tlbGV0b246IFNrZWxldG9uLCBzbG90OiBTbG90LCBhdHRhY2htZW50TmFtZTogc3RyaW5nIHwgbnVsbCkge1xuXHRcdHNsb3Quc2V0QXR0YWNobWVudCghYXR0YWNobWVudE5hbWUgPyBudWxsIDogc2tlbGV0b24uZ2V0QXR0YWNobWVudCh0aGlzLnNsb3RJbmRleCwgYXR0YWNobWVudE5hbWUpKTtcblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIHNsb3QncyB7QGxpbmsgU2xvdCNkZWZvcm19IHRvIGRlZm9ybSBhIHtAbGluayBWZXJ0ZXhBdHRhY2htZW50fS4gKi9cbmV4cG9ydCBjbGFzcyBEZWZvcm1UaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUgaW1wbGVtZW50cyBTbG90VGltZWxpbmUge1xuXHRzbG90SW5kZXggPSAwO1xuXG5cdC8qKiBUaGUgYXR0YWNobWVudCB0aGF0IHdpbGwgYmUgZGVmb3JtZWQuICovXG5cdGF0dGFjaG1lbnQ6IFZlcnRleEF0dGFjaG1lbnQ7XG5cblx0LyoqIFRoZSB2ZXJ0aWNlcyBmb3IgZWFjaCBrZXkgZnJhbWUuICovXG5cdHZlcnRpY2VzOiBBcnJheTxOdW1iZXJBcnJheUxpa2U+O1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIHNsb3RJbmRleDogbnVtYmVyLCBhdHRhY2htZW50OiBWZXJ0ZXhBdHRhY2htZW50KSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFtcblx0XHRcdFByb3BlcnR5LmRlZm9ybSArIFwifFwiICsgc2xvdEluZGV4ICsgXCJ8XCIgKyBhdHRhY2htZW50LmlkXG5cdFx0XSk7XG5cdFx0dGhpcy5zbG90SW5kZXggPSBzbG90SW5kZXg7XG5cdFx0dGhpcy5hdHRhY2htZW50ID0gYXR0YWNobWVudDtcblx0XHR0aGlzLnZlcnRpY2VzID0gbmV3IEFycmF5PE51bWJlckFycmF5TGlrZT4oZnJhbWVDb3VudCk7XG5cdH1cblxuXHRnZXRGcmFtZUNvdW50ICgpIHtcblx0XHRyZXR1cm4gdGhpcy5mcmFtZXMubGVuZ3RoO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIHRpbWUgaW4gc2Vjb25kcyBhbmQgdGhlIHZlcnRpY2VzIGZvciB0aGUgc3BlY2lmaWVkIGtleSBmcmFtZS5cblx0ICogQHBhcmFtIHZlcnRpY2VzIFZlcnRleCBwb3NpdGlvbnMgZm9yIGFuIHVud2VpZ2h0ZWQgVmVydGV4QXR0YWNobWVudCwgb3IgZGVmb3JtIG9mZnNldHMgaWYgaXQgaGFzIHdlaWdodHMuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIHZlcnRpY2VzOiBOdW1iZXJBcnJheUxpa2UpIHtcblx0XHR0aGlzLmZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdHRoaXMudmVydGljZXNbZnJhbWVdID0gdmVydGljZXM7XG5cdH1cblxuXHQvKiogQHBhcmFtIHZhbHVlMSBJZ25vcmVkICgwIGlzIHVzZWQgZm9yIGEgZGVmb3JtIHRpbWVsaW5lKS5cblx0ICogQHBhcmFtIHZhbHVlMiBJZ25vcmVkICgxIGlzIHVzZWQgZm9yIGEgZGVmb3JtIHRpbWVsaW5lKS4gKi9cblx0c2V0QmV6aWVyIChiZXppZXI6IG51bWJlciwgZnJhbWU6IG51bWJlciwgdmFsdWU6IG51bWJlciwgdGltZTE6IG51bWJlciwgdmFsdWUxOiBudW1iZXIsIGN4MTogbnVtYmVyLCBjeTE6IG51bWJlciwgY3gyOiBudW1iZXIsXG5cdFx0Y3kyOiBudW1iZXIsIHRpbWUyOiBudW1iZXIsIHZhbHVlMjogbnVtYmVyKSB7XG5cdFx0bGV0IGN1cnZlcyA9IHRoaXMuY3VydmVzO1xuXHRcdGxldCBpID0gdGhpcy5nZXRGcmFtZUNvdW50KCkgKyBiZXppZXIgKiAxOC8qQkVaSUVSX1NJWkUqLztcblx0XHRpZiAodmFsdWUgPT0gMCkgY3VydmVzW2ZyYW1lXSA9IDIvKkJFWklFUiovICsgaTtcblx0XHRsZXQgdG1weCA9ICh0aW1lMSAtIGN4MSAqIDIgKyBjeDIpICogMC4wMywgdG1weSA9IGN5MiAqIDAuMDMgLSBjeTEgKiAwLjA2O1xuXHRcdGxldCBkZGR4ID0gKChjeDEgLSBjeDIpICogMyAtIHRpbWUxICsgdGltZTIpICogMC4wMDYsIGRkZHkgPSAoY3kxIC0gY3kyICsgMC4zMzMzMzMzMykgKiAwLjAxODtcblx0XHRsZXQgZGR4ID0gdG1weCAqIDIgKyBkZGR4LCBkZHkgPSB0bXB5ICogMiArIGRkZHk7XG5cdFx0bGV0IGR4ID0gKGN4MSAtIHRpbWUxKSAqIDAuMyArIHRtcHggKyBkZGR4ICogMC4xNjY2NjY2NywgZHkgPSBjeTEgKiAwLjMgKyB0bXB5ICsgZGRkeSAqIDAuMTY2NjY2Njc7XG5cdFx0bGV0IHggPSB0aW1lMSArIGR4LCB5ID0gZHk7XG5cdFx0Zm9yIChsZXQgbiA9IGkgKyAxOC8qQkVaSUVSX1NJWkUqLzsgaSA8IG47IGkgKz0gMikge1xuXHRcdFx0Y3VydmVzW2ldID0geDtcblx0XHRcdGN1cnZlc1tpICsgMV0gPSB5O1xuXHRcdFx0ZHggKz0gZGR4O1xuXHRcdFx0ZHkgKz0gZGR5O1xuXHRcdFx0ZGR4ICs9IGRkZHg7XG5cdFx0XHRkZHkgKz0gZGRkeTtcblx0XHRcdHggKz0gZHg7XG5cdFx0XHR5ICs9IGR5O1xuXHRcdH1cblx0fVxuXG5cdGdldEN1cnZlUGVyY2VudCAodGltZTogbnVtYmVyLCBmcmFtZTogbnVtYmVyKSB7XG5cdFx0bGV0IGN1cnZlcyA9IHRoaXMuY3VydmVzO1xuXHRcdGxldCBpID0gY3VydmVzW2ZyYW1lXTtcblx0XHRzd2l0Y2ggKGkpIHtcblx0XHRcdGNhc2UgMC8qTElORUFSKi86XG5cdFx0XHRcdGxldCB4ID0gdGhpcy5mcmFtZXNbZnJhbWVdO1xuXHRcdFx0XHRyZXR1cm4gKHRpbWUgLSB4KSAvICh0aGlzLmZyYW1lc1tmcmFtZSArIHRoaXMuZ2V0RnJhbWVFbnRyaWVzKCldIC0geCk7XG5cdFx0XHRjYXNlIDEvKlNURVBQRUQqLzpcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGkgLT0gMi8qQkVaSUVSKi87XG5cdFx0aWYgKGN1cnZlc1tpXSA+IHRpbWUpIHtcblx0XHRcdGxldCB4ID0gdGhpcy5mcmFtZXNbZnJhbWVdO1xuXHRcdFx0cmV0dXJuIGN1cnZlc1tpICsgMV0gKiAodGltZSAtIHgpIC8gKGN1cnZlc1tpXSAtIHgpO1xuXHRcdH1cblx0XHRsZXQgbiA9IGkgKyAxOC8qQkVaSUVSX1NJWkUqLztcblx0XHRmb3IgKGkgKz0gMjsgaSA8IG47IGkgKz0gMikge1xuXHRcdFx0aWYgKGN1cnZlc1tpXSA+PSB0aW1lKSB7XG5cdFx0XHRcdGxldCB4ID0gY3VydmVzW2kgLSAyXSwgeSA9IGN1cnZlc1tpIC0gMV07XG5cdFx0XHRcdHJldHVybiB5ICsgKHRpbWUgLSB4KSAvIChjdXJ2ZXNbaV0gLSB4KSAqIChjdXJ2ZXNbaSArIDFdIC0geSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCB4ID0gY3VydmVzW24gLSAyXSwgeSA9IGN1cnZlc1tuIC0gMV07XG5cdFx0cmV0dXJuIHkgKyAoMSAtIHkpICogKHRpbWUgLSB4KSAvICh0aGlzLmZyYW1lc1tmcmFtZSArIHRoaXMuZ2V0RnJhbWVFbnRyaWVzKCldIC0geCk7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGZpcmVkRXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgc2xvdDogU2xvdCA9IHNrZWxldG9uLnNsb3RzW3RoaXMuc2xvdEluZGV4XTtcblx0XHRpZiAoIXNsb3QuYm9uZS5hY3RpdmUpIHJldHVybjtcblx0XHRsZXQgc2xvdEF0dGFjaG1lbnQ6IEF0dGFjaG1lbnQgfCBudWxsID0gc2xvdC5nZXRBdHRhY2htZW50KCk7XG5cdFx0aWYgKCFzbG90QXR0YWNobWVudCkgcmV0dXJuO1xuXHRcdGlmICghKHNsb3RBdHRhY2htZW50IGluc3RhbmNlb2YgVmVydGV4QXR0YWNobWVudCkgfHwgKDxWZXJ0ZXhBdHRhY2htZW50PnNsb3RBdHRhY2htZW50KS50aW1lbGluZUF0dGFjaG1lbnQgIT0gdGhpcy5hdHRhY2htZW50KSByZXR1cm47XG5cblx0XHRsZXQgZGVmb3JtOiBBcnJheTxudW1iZXI+ID0gc2xvdC5kZWZvcm07XG5cdFx0aWYgKGRlZm9ybS5sZW5ndGggPT0gMCkgYmxlbmQgPSBNaXhCbGVuZC5zZXR1cDtcblxuXHRcdGxldCB2ZXJ0aWNlcyA9IHRoaXMudmVydGljZXM7XG5cdFx0bGV0IHZlcnRleENvdW50ID0gdmVydGljZXNbMF0ubGVuZ3RoO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGlmICh0aW1lIDwgZnJhbWVzWzBdKSB7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0ZGVmb3JtLmxlbmd0aCA9IDA7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdGlmIChhbHBoYSA9PSAxKSB7XG5cdFx0XHRcdFx0XHRkZWZvcm0ubGVuZ3RoID0gMDtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVmb3JtLmxlbmd0aCA9IHZlcnRleENvdW50O1xuXHRcdFx0XHRcdGxldCB2ZXJ0ZXhBdHRhY2htZW50ID0gPFZlcnRleEF0dGFjaG1lbnQ+c2xvdEF0dGFjaG1lbnQ7XG5cdFx0XHRcdFx0aWYgKCF2ZXJ0ZXhBdHRhY2htZW50LmJvbmVzKSB7XG5cdFx0XHRcdFx0XHQvLyBVbndlaWdodGVkIHZlcnRleCBwb3NpdGlvbnMuXG5cdFx0XHRcdFx0XHRsZXQgc2V0dXBWZXJ0aWNlcyA9IHZlcnRleEF0dGFjaG1lbnQudmVydGljZXM7XG5cdFx0XHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHZlcnRleENvdW50OyBpKyspXG5cdFx0XHRcdFx0XHRcdGRlZm9ybVtpXSArPSAoc2V0dXBWZXJ0aWNlc1tpXSAtIGRlZm9ybVtpXSkgKiBhbHBoYTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gV2VpZ2h0ZWQgZGVmb3JtIG9mZnNldHMuXG5cdFx0XHRcdFx0XHRhbHBoYSA9IDEgLSBhbHBoYTtcblx0XHRcdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdmVydGV4Q291bnQ7IGkrKylcblx0XHRcdFx0XHRcdFx0ZGVmb3JtW2ldICo9IGFscGhhO1xuXHRcdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkZWZvcm0ubGVuZ3RoID0gdmVydGV4Q291bnQ7XG5cdFx0aWYgKHRpbWUgPj0gZnJhbWVzW2ZyYW1lcy5sZW5ndGggLSAxXSkge1xuXHRcdFx0bGV0IGxhc3RWZXJ0aWNlcyA9IHZlcnRpY2VzW2ZyYW1lcy5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChhbHBoYSA9PSAxKSB7XG5cdFx0XHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5hZGQpIHtcblx0XHRcdFx0XHRsZXQgdmVydGV4QXR0YWNobWVudCA9IHNsb3RBdHRhY2htZW50IGFzIFZlcnRleEF0dGFjaG1lbnQ7XG5cdFx0XHRcdFx0aWYgKCF2ZXJ0ZXhBdHRhY2htZW50LmJvbmVzKSB7XG5cdFx0XHRcdFx0XHQvLyBVbndlaWdodGVkIHZlcnRleCBwb3NpdGlvbnMsIHdpdGggYWxwaGEuXG5cdFx0XHRcdFx0XHRsZXQgc2V0dXBWZXJ0aWNlcyA9IHZlcnRleEF0dGFjaG1lbnQudmVydGljZXM7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRleENvdW50OyBpKyspXG5cdFx0XHRcdFx0XHRcdGRlZm9ybVtpXSArPSBsYXN0VmVydGljZXNbaV0gLSBzZXR1cFZlcnRpY2VzW2ldO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBXZWlnaHRlZCBkZWZvcm0gb2Zmc2V0cywgd2l0aCBhbHBoYS5cblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmVydGV4Q291bnQ7IGkrKylcblx0XHRcdFx0XHRcdFx0ZGVmb3JtW2ldICs9IGxhc3RWZXJ0aWNlc1tpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRcdFV0aWxzLmFycmF5Q29weShsYXN0VmVydGljZXMsIDAsIGRlZm9ybSwgMCwgdmVydGV4Q291bnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3dpdGNoIChibGVuZCkge1xuXHRcdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6IHtcblx0XHRcdFx0XHRcdGxldCB2ZXJ0ZXhBdHRhY2htZW50ID0gc2xvdEF0dGFjaG1lbnQgYXMgVmVydGV4QXR0YWNobWVudDtcblx0XHRcdFx0XHRcdGlmICghdmVydGV4QXR0YWNobWVudC5ib25lcykge1xuXHRcdFx0XHRcdFx0XHQvLyBVbndlaWdodGVkIHZlcnRleCBwb3NpdGlvbnMsIHdpdGggYWxwaGEuXG5cdFx0XHRcdFx0XHRcdGxldCBzZXR1cFZlcnRpY2VzID0gdmVydGV4QXR0YWNobWVudC52ZXJ0aWNlcztcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhDb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IHNldHVwID0gc2V0dXBWZXJ0aWNlc1tpXTtcblx0XHRcdFx0XHRcdFx0XHRkZWZvcm1baV0gPSBzZXR1cCArIChsYXN0VmVydGljZXNbaV0gLSBzZXR1cCkgKiBhbHBoYTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2VpZ2h0ZWQgZGVmb3JtIG9mZnNldHMsIHdpdGggYWxwaGEuXG5cdFx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmVydGV4Q291bnQ7IGkrKylcblx0XHRcdFx0XHRcdFx0XHRkZWZvcm1baV0gPSBsYXN0VmVydGljZXNbaV0gKiBhbHBoYTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdGNhc2UgTWl4QmxlbmQucmVwbGFjZTpcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmVydGV4Q291bnQ7IGkrKylcblx0XHRcdFx0XHRcdFx0ZGVmb3JtW2ldICs9IChsYXN0VmVydGljZXNbaV0gLSBkZWZvcm1baV0pICogYWxwaGE7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE1peEJsZW5kLmFkZDpcblx0XHRcdFx0XHRcdGxldCB2ZXJ0ZXhBdHRhY2htZW50ID0gc2xvdEF0dGFjaG1lbnQgYXMgVmVydGV4QXR0YWNobWVudDtcblx0XHRcdFx0XHRcdGlmICghdmVydGV4QXR0YWNobWVudC5ib25lcykge1xuXHRcdFx0XHRcdFx0XHQvLyBVbndlaWdodGVkIHZlcnRleCBwb3NpdGlvbnMsIHdpdGggYWxwaGEuXG5cdFx0XHRcdFx0XHRcdGxldCBzZXR1cFZlcnRpY2VzID0gdmVydGV4QXR0YWNobWVudC52ZXJ0aWNlcztcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhDb3VudDsgaSsrKVxuXHRcdFx0XHRcdFx0XHRcdGRlZm9ybVtpXSArPSAobGFzdFZlcnRpY2VzW2ldIC0gc2V0dXBWZXJ0aWNlc1tpXSkgKiBhbHBoYTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIFdlaWdodGVkIGRlZm9ybSBvZmZzZXRzLCB3aXRoIGFscGhhLlxuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRleENvdW50OyBpKyspXG5cdFx0XHRcdFx0XHRcdFx0ZGVmb3JtW2ldICs9IGxhc3RWZXJ0aWNlc1tpXSAqIGFscGhhO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW50ZXJwb2xhdGUgYmV0d2VlbiB0aGUgcHJldmlvdXMgZnJhbWUgYW5kIHRoZSBjdXJyZW50IGZyYW1lLlxuXHRcdGxldCBmcmFtZSA9IFRpbWVsaW5lLnNlYXJjaDEoZnJhbWVzLCB0aW1lKTtcblx0XHRsZXQgcGVyY2VudCA9IHRoaXMuZ2V0Q3VydmVQZXJjZW50KHRpbWUsIGZyYW1lKTtcblx0XHRsZXQgcHJldlZlcnRpY2VzID0gdmVydGljZXNbZnJhbWVdO1xuXHRcdGxldCBuZXh0VmVydGljZXMgPSB2ZXJ0aWNlc1tmcmFtZSArIDFdO1xuXG5cdFx0aWYgKGFscGhhID09IDEpIHtcblx0XHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5hZGQpIHtcblx0XHRcdFx0bGV0IHZlcnRleEF0dGFjaG1lbnQgPSBzbG90QXR0YWNobWVudCBhcyBWZXJ0ZXhBdHRhY2htZW50O1xuXHRcdFx0XHRpZiAoIXZlcnRleEF0dGFjaG1lbnQuYm9uZXMpIHtcblx0XHRcdFx0XHQvLyBVbndlaWdodGVkIHZlcnRleCBwb3NpdGlvbnMsIHdpdGggYWxwaGEuXG5cdFx0XHRcdFx0bGV0IHNldHVwVmVydGljZXMgPSB2ZXJ0ZXhBdHRhY2htZW50LnZlcnRpY2VzO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmVydGV4Q291bnQ7IGkrKykge1xuXHRcdFx0XHRcdFx0bGV0IHByZXYgPSBwcmV2VmVydGljZXNbaV07XG5cdFx0XHRcdFx0XHRkZWZvcm1baV0gKz0gcHJldiArIChuZXh0VmVydGljZXNbaV0gLSBwcmV2KSAqIHBlcmNlbnQgLSBzZXR1cFZlcnRpY2VzW2ldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBXZWlnaHRlZCBkZWZvcm0gb2Zmc2V0cywgd2l0aCBhbHBoYS5cblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRleENvdW50OyBpKyspIHtcblx0XHRcdFx0XHRcdGxldCBwcmV2ID0gcHJldlZlcnRpY2VzW2ldO1xuXHRcdFx0XHRcdFx0ZGVmb3JtW2ldICs9IHByZXYgKyAobmV4dFZlcnRpY2VzW2ldIC0gcHJldikgKiBwZXJjZW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhDb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0bGV0IHByZXYgPSBwcmV2VmVydGljZXNbaV07XG5cdFx0XHRcdFx0ZGVmb3JtW2ldID0gcHJldiArIChuZXh0VmVydGljZXNbaV0gLSBwcmV2KSAqIHBlcmNlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0c3dpdGNoIChibGVuZCkge1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLnNldHVwOiB7XG5cdFx0XHRcdFx0bGV0IHZlcnRleEF0dGFjaG1lbnQgPSBzbG90QXR0YWNobWVudCBhcyBWZXJ0ZXhBdHRhY2htZW50O1xuXHRcdFx0XHRcdGlmICghdmVydGV4QXR0YWNobWVudC5ib25lcykge1xuXHRcdFx0XHRcdFx0Ly8gVW53ZWlnaHRlZCB2ZXJ0ZXggcG9zaXRpb25zLCB3aXRoIGFscGhhLlxuXHRcdFx0XHRcdFx0bGV0IHNldHVwVmVydGljZXMgPSB2ZXJ0ZXhBdHRhY2htZW50LnZlcnRpY2VzO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhDb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBwcmV2ID0gcHJldlZlcnRpY2VzW2ldLCBzZXR1cCA9IHNldHVwVmVydGljZXNbaV07XG5cdFx0XHRcdFx0XHRcdGRlZm9ybVtpXSA9IHNldHVwICsgKHByZXYgKyAobmV4dFZlcnRpY2VzW2ldIC0gcHJldikgKiBwZXJjZW50IC0gc2V0dXApICogYWxwaGE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFdlaWdodGVkIGRlZm9ybSBvZmZzZXRzLCB3aXRoIGFscGhhLlxuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhDb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBwcmV2ID0gcHJldlZlcnRpY2VzW2ldO1xuXHRcdFx0XHRcdFx0XHRkZWZvcm1baV0gPSAocHJldiArIChuZXh0VmVydGljZXNbaV0gLSBwcmV2KSAqIHBlcmNlbnQpICogYWxwaGE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuZmlyc3Q6XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQucmVwbGFjZTpcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRleENvdW50OyBpKyspIHtcblx0XHRcdFx0XHRcdGxldCBwcmV2ID0gcHJldlZlcnRpY2VzW2ldO1xuXHRcdFx0XHRcdFx0ZGVmb3JtW2ldICs9IChwcmV2ICsgKG5leHRWZXJ0aWNlc1tpXSAtIHByZXYpICogcGVyY2VudCAtIGRlZm9ybVtpXSkgKiBhbHBoYTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuYWRkOlxuXHRcdFx0XHRcdGxldCB2ZXJ0ZXhBdHRhY2htZW50ID0gc2xvdEF0dGFjaG1lbnQgYXMgVmVydGV4QXR0YWNobWVudDtcblx0XHRcdFx0XHRpZiAoIXZlcnRleEF0dGFjaG1lbnQuYm9uZXMpIHtcblx0XHRcdFx0XHRcdC8vIFVud2VpZ2h0ZWQgdmVydGV4IHBvc2l0aW9ucywgd2l0aCBhbHBoYS5cblx0XHRcdFx0XHRcdGxldCBzZXR1cFZlcnRpY2VzID0gdmVydGV4QXR0YWNobWVudC52ZXJ0aWNlcztcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmVydGV4Q291bnQ7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRsZXQgcHJldiA9IHByZXZWZXJ0aWNlc1tpXTtcblx0XHRcdFx0XHRcdFx0ZGVmb3JtW2ldICs9IChwcmV2ICsgKG5leHRWZXJ0aWNlc1tpXSAtIHByZXYpICogcGVyY2VudCAtIHNldHVwVmVydGljZXNbaV0pICogYWxwaGE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFdlaWdodGVkIGRlZm9ybSBvZmZzZXRzLCB3aXRoIGFscGhhLlxuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhDb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBwcmV2ID0gcHJldlZlcnRpY2VzW2ldO1xuXHRcdFx0XHRcdFx0XHRkZWZvcm1baV0gKz0gKHByZXYgKyAobmV4dFZlcnRpY2VzW2ldIC0gcHJldikgKiBwZXJjZW50KSAqIGFscGhhO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqIEZpcmVzIGFuIHtAbGluayBFdmVudH0gd2hlbiBzcGVjaWZpYyBhbmltYXRpb24gdGltZXMgYXJlIHJlYWNoZWQuICovXG5leHBvcnQgY2xhc3MgRXZlbnRUaW1lbGluZSBleHRlbmRzIFRpbWVsaW5lIHtcblx0c3RhdGljIHByb3BlcnR5SWRzID0gW1wiXCIgKyBQcm9wZXJ0eS5ldmVudF07XG5cblx0LyoqIFRoZSBldmVudCBmb3IgZWFjaCBrZXkgZnJhbWUuICovXG5cdGV2ZW50czogQXJyYXk8RXZlbnQ+O1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBFdmVudFRpbWVsaW5lLnByb3BlcnR5SWRzKTtcblxuXHRcdHRoaXMuZXZlbnRzID0gbmV3IEFycmF5PEV2ZW50PihmcmFtZUNvdW50KTtcblx0fVxuXG5cdGdldEZyYW1lQ291bnQgKCkge1xuXHRcdHJldHVybiB0aGlzLmZyYW1lcy5sZW5ndGg7XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgdGltZSBpbiBzZWNvbmRzIGFuZCB0aGUgZXZlbnQgZm9yIHRoZSBzcGVjaWZpZWQga2V5IGZyYW1lLiAqL1xuXHRzZXRGcmFtZSAoZnJhbWU6IG51bWJlciwgZXZlbnQ6IEV2ZW50KSB7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWVdID0gZXZlbnQudGltZTtcblx0XHR0aGlzLmV2ZW50c1tmcmFtZV0gPSBldmVudDtcblx0fVxuXG5cdC8qKiBGaXJlcyBldmVudHMgZm9yIGZyYW1lcyA+IGBsYXN0VGltZWAgYW5kIDw9IGB0aW1lYC4gKi9cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBmaXJlZEV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0aWYgKCFmaXJlZEV2ZW50cykgcmV0dXJuO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGxldCBmcmFtZUNvdW50ID0gdGhpcy5mcmFtZXMubGVuZ3RoO1xuXG5cdFx0aWYgKGxhc3RUaW1lID4gdGltZSkgeyAvLyBBcHBseSBhZnRlciBsYXN0VGltZSBmb3IgbG9vcGVkIGFuaW1hdGlvbnMuXG5cdFx0XHR0aGlzLmFwcGx5KHNrZWxldG9uLCBsYXN0VGltZSwgTnVtYmVyLk1BWF9WQUxVRSwgZmlyZWRFdmVudHMsIGFscGhhLCBibGVuZCwgZGlyZWN0aW9uKTtcblx0XHRcdGxhc3RUaW1lID0gLTE7XG5cdFx0fSBlbHNlIGlmIChsYXN0VGltZSA+PSBmcmFtZXNbZnJhbWVDb3VudCAtIDFdKSAvLyBMYXN0IHRpbWUgaXMgYWZ0ZXIgbGFzdCBmcmFtZS5cblx0XHRcdHJldHVybjtcblx0XHRpZiAodGltZSA8IGZyYW1lc1swXSkgcmV0dXJuO1xuXG5cdFx0bGV0IGkgPSAwO1xuXHRcdGlmIChsYXN0VGltZSA8IGZyYW1lc1swXSlcblx0XHRcdGkgPSAwO1xuXHRcdGVsc2Uge1xuXHRcdFx0aSA9IFRpbWVsaW5lLnNlYXJjaDEoZnJhbWVzLCBsYXN0VGltZSkgKyAxO1xuXHRcdFx0bGV0IGZyYW1lVGltZSA9IGZyYW1lc1tpXTtcblx0XHRcdHdoaWxlIChpID4gMCkgeyAvLyBGaXJlIG11bHRpcGxlIGV2ZW50cyB3aXRoIHRoZSBzYW1lIGZyYW1lLlxuXHRcdFx0XHRpZiAoZnJhbWVzW2kgLSAxXSAhPSBmcmFtZVRpbWUpIGJyZWFrO1xuXHRcdFx0XHRpLS07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoOyBpIDwgZnJhbWVDb3VudCAmJiB0aW1lID49IGZyYW1lc1tpXTsgaSsrKVxuXHRcdFx0ZmlyZWRFdmVudHMucHVzaCh0aGlzLmV2ZW50c1tpXSk7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBza2VsZXRvbidzIHtAbGluayBTa2VsZXRvbiNkcmF3T3JkZXJ9LiAqL1xuZXhwb3J0IGNsYXNzIERyYXdPcmRlclRpbWVsaW5lIGV4dGVuZHMgVGltZWxpbmUge1xuXHRzdGF0aWMgcHJvcGVydHlJZHMgPSBbXCJcIiArIFByb3BlcnR5LmRyYXdPcmRlcl07XG5cblx0LyoqIFRoZSBkcmF3IG9yZGVyIGZvciBlYWNoIGtleSBmcmFtZS4gU2VlIHtAbGluayAjc2V0RnJhbWUoaW50LCBmbG9hdCwgaW50W10pfS4gKi9cblx0ZHJhd09yZGVyczogQXJyYXk8QXJyYXk8bnVtYmVyPiB8IG51bGw+O1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBEcmF3T3JkZXJUaW1lbGluZS5wcm9wZXJ0eUlkcyk7XG5cdFx0dGhpcy5kcmF3T3JkZXJzID0gbmV3IEFycmF5PEFycmF5PG51bWJlcj4gfCBudWxsPihmcmFtZUNvdW50KTtcblx0fVxuXG5cdGdldEZyYW1lQ291bnQgKCkge1xuXHRcdHJldHVybiB0aGlzLmZyYW1lcy5sZW5ndGg7XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgdGltZSBpbiBzZWNvbmRzIGFuZCB0aGUgZHJhdyBvcmRlciBmb3IgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUuXG5cdCAqIEBwYXJhbSBkcmF3T3JkZXIgRm9yIGVhY2ggc2xvdCBpbiB7QGxpbmsgU2tlbGV0b24jc2xvdHN9LCB0aGUgaW5kZXggb2YgdGhlIG5ldyBkcmF3IG9yZGVyLiBNYXkgYmUgbnVsbCB0byB1c2Ugc2V0dXAgcG9zZVxuXHQgKiAgICAgICAgICAgZHJhdyBvcmRlci4gKi9cblx0c2V0RnJhbWUgKGZyYW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZHJhd09yZGVyOiBBcnJheTxudW1iZXI+IHwgbnVsbCkge1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lXSA9IHRpbWU7XG5cdFx0dGhpcy5kcmF3T3JkZXJzW2ZyYW1lXSA9IGRyYXdPcmRlcjtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZmlyZWRFdmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGlmIChkaXJlY3Rpb24gPT0gTWl4RGlyZWN0aW9uLm1peE91dCkge1xuXHRcdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSBVdGlscy5hcnJheUNvcHkoc2tlbGV0b24uc2xvdHMsIDAsIHNrZWxldG9uLmRyYXdPcmRlciwgMCwgc2tlbGV0b24uc2xvdHMubGVuZ3RoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGltZSA8IHRoaXMuZnJhbWVzWzBdKSB7XG5cdFx0XHRpZiAoYmxlbmQgPT0gTWl4QmxlbmQuc2V0dXAgfHwgYmxlbmQgPT0gTWl4QmxlbmQuZmlyc3QpIFV0aWxzLmFycmF5Q29weShza2VsZXRvbi5zbG90cywgMCwgc2tlbGV0b24uZHJhd09yZGVyLCAwLCBza2VsZXRvbi5zbG90cy5sZW5ndGgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpZHggPSBUaW1lbGluZS5zZWFyY2gxKHRoaXMuZnJhbWVzLCB0aW1lKTtcblx0XHRsZXQgZHJhd09yZGVyVG9TZXR1cEluZGV4ID0gdGhpcy5kcmF3T3JkZXJzW2lkeF07XG5cdFx0aWYgKCFkcmF3T3JkZXJUb1NldHVwSW5kZXgpXG5cdFx0XHRVdGlscy5hcnJheUNvcHkoc2tlbGV0b24uc2xvdHMsIDAsIHNrZWxldG9uLmRyYXdPcmRlciwgMCwgc2tlbGV0b24uc2xvdHMubGVuZ3RoKTtcblx0XHRlbHNlIHtcblx0XHRcdGxldCBkcmF3T3JkZXI6IEFycmF5PFNsb3Q+ID0gc2tlbGV0b24uZHJhd09yZGVyO1xuXHRcdFx0bGV0IHNsb3RzOiBBcnJheTxTbG90PiA9IHNrZWxldG9uLnNsb3RzO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIG4gPSBkcmF3T3JkZXJUb1NldHVwSW5kZXgubGVuZ3RoOyBpIDwgbjsgaSsrKVxuXHRcdFx0XHRkcmF3T3JkZXJbaV0gPSBzbG90c1tkcmF3T3JkZXJUb1NldHVwSW5kZXhbaV1dO1xuXHRcdH1cblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhbiBJSyBjb25zdHJhaW50J3Mge0BsaW5rIElrQ29uc3RyYWludCNtaXh9LCB7QGxpbmsgSWtDb25zdHJhaW50I3NvZnRuZXNzfSxcbiAqIHtAbGluayBJa0NvbnN0cmFpbnQjYmVuZERpcmVjdGlvbn0sIHtAbGluayBJa0NvbnN0cmFpbnQjc3RyZXRjaH0sIGFuZCB7QGxpbmsgSWtDb25zdHJhaW50I2NvbXByZXNzfS4gKi9cbmV4cG9ydCBjbGFzcyBJa0NvbnN0cmFpbnRUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUge1xuXHQvKiogVGhlIGluZGV4IG9mIHRoZSBJSyBjb25zdHJhaW50IGluIHtAbGluayBTa2VsZXRvbiNnZXRJa0NvbnN0cmFpbnRzKCl9IHRoYXQgd2lsbCBiZSBjaGFuZ2VkIHdoZW4gdGhpcyB0aW1lbGluZSBpcyBhcHBsaWVkICovXG5cdGNvbnN0cmFpbnRJbmRleDogbnVtYmVyID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBpa0NvbnN0cmFpbnRJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFtcblx0XHRcdFByb3BlcnR5LmlrQ29uc3RyYWludCArIFwifFwiICsgaWtDb25zdHJhaW50SW5kZXhcblx0XHRdKTtcblx0XHR0aGlzLmNvbnN0cmFpbnRJbmRleCA9IGlrQ29uc3RyYWludEluZGV4O1xuXHR9XG5cblx0Z2V0RnJhbWVFbnRyaWVzICgpIHtcblx0XHRyZXR1cm4gNi8qRU5UUklFUyovO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIHRpbWUgaW4gc2Vjb25kcywgbWl4LCBzb2Z0bmVzcywgYmVuZCBkaXJlY3Rpb24sIGNvbXByZXNzLCBhbmQgc3RyZXRjaCBmb3IgdGhlIHNwZWNpZmllZCBrZXkgZnJhbWUuICovXG5cdHNldEZyYW1lIChmcmFtZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIG1peDogbnVtYmVyLCBzb2Z0bmVzczogbnVtYmVyLCBiZW5kRGlyZWN0aW9uOiBudW1iZXIsIGNvbXByZXNzOiBib29sZWFuLCBzdHJldGNoOiBib29sZWFuKSB7XG5cdFx0ZnJhbWUgKj0gNi8qRU5UUklFUyovO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lXSA9IHRpbWU7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyAxLypNSVgqL10gPSBtaXg7XG5cdFx0dGhpcy5mcmFtZXNbZnJhbWUgKyAyLypTT0ZUTkVTUyovXSA9IHNvZnRuZXNzO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgMy8qQkVORF9ESVJFQ1RJT04qL10gPSBiZW5kRGlyZWN0aW9uO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgNC8qQ09NUFJFU1MqL10gPSBjb21wcmVzcyA/IDEgOiAwO1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lICsgNS8qU1RSRVRDSCovXSA9IHN0cmV0Y2ggPyAxIDogMDtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZmlyZWRFdmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBjb25zdHJhaW50OiBJa0NvbnN0cmFpbnQgPSBza2VsZXRvbi5pa0NvbnN0cmFpbnRzW3RoaXMuY29uc3RyYWludEluZGV4XTtcblx0XHRpZiAoIWNvbnN0cmFpbnQuYWN0aXZlKSByZXR1cm47XG5cblx0XHRsZXQgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRjb25zdHJhaW50Lm1peCA9IGNvbnN0cmFpbnQuZGF0YS5taXg7XG5cdFx0XHRcdFx0Y29uc3RyYWludC5zb2Z0bmVzcyA9IGNvbnN0cmFpbnQuZGF0YS5zb2Z0bmVzcztcblx0XHRcdFx0XHRjb25zdHJhaW50LmJlbmREaXJlY3Rpb24gPSBjb25zdHJhaW50LmRhdGEuYmVuZERpcmVjdGlvbjtcblx0XHRcdFx0XHRjb25zdHJhaW50LmNvbXByZXNzID0gY29uc3RyYWludC5kYXRhLmNvbXByZXNzO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQuc3RyZXRjaCA9IGNvbnN0cmFpbnQuZGF0YS5zdHJldGNoO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdFx0XHRjb25zdHJhaW50Lm1peCArPSAoY29uc3RyYWludC5kYXRhLm1peCAtIGNvbnN0cmFpbnQubWl4KSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQuc29mdG5lc3MgKz0gKGNvbnN0cmFpbnQuZGF0YS5zb2Z0bmVzcyAtIGNvbnN0cmFpbnQuc29mdG5lc3MpICogYWxwaGE7XG5cdFx0XHRcdFx0Y29uc3RyYWludC5iZW5kRGlyZWN0aW9uID0gY29uc3RyYWludC5kYXRhLmJlbmREaXJlY3Rpb247XG5cdFx0XHRcdFx0Y29uc3RyYWludC5jb21wcmVzcyA9IGNvbnN0cmFpbnQuZGF0YS5jb21wcmVzcztcblx0XHRcdFx0XHRjb25zdHJhaW50LnN0cmV0Y2ggPSBjb25zdHJhaW50LmRhdGEuc3RyZXRjaDtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbWl4ID0gMCwgc29mdG5lc3MgPSAwO1xuXHRcdGxldCBpID0gVGltZWxpbmUuc2VhcmNoKGZyYW1lcywgdGltZSwgNi8qRU5UUklFUyovKVxuXHRcdGxldCBjdXJ2ZVR5cGUgPSB0aGlzLmN1cnZlc1tpIC8gNi8qRU5UUklFUyovXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0bWl4ID0gZnJhbWVzW2kgKyAxLypNSVgqL107XG5cdFx0XHRcdHNvZnRuZXNzID0gZnJhbWVzW2kgKyAyLypTT0ZUTkVTUyovXTtcblx0XHRcdFx0bGV0IHQgPSAodGltZSAtIGJlZm9yZSkgLyAoZnJhbWVzW2kgKyA2LypFTlRSSUVTKi9dIC0gYmVmb3JlKTtcblx0XHRcdFx0bWl4ICs9IChmcmFtZXNbaSArIDYvKkVOVFJJRVMqLyArIDEvKk1JWCovXSAtIG1peCkgKiB0O1xuXHRcdFx0XHRzb2Z0bmVzcyArPSAoZnJhbWVzW2kgKyA2LypFTlRSSUVTKi8gKyAyLypTT0ZUTkVTUyovXSAtIHNvZnRuZXNzKSAqIHQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAxLypTVEVQUEVEKi86XG5cdFx0XHRcdG1peCA9IGZyYW1lc1tpICsgMS8qTUlYKi9dO1xuXHRcdFx0XHRzb2Z0bmVzcyA9IGZyYW1lc1tpICsgMi8qU09GVE5FU1MqL107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bWl4ID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCAxLypNSVgqLywgY3VydmVUeXBlIC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRzb2Z0bmVzcyA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qU09GVE5FU1MqLywgY3VydmVUeXBlICsgMTgvKkJFWklFUl9TSVpFKi8gLSAyLypCRVpJRVIqLyk7XG5cdFx0fVxuXG5cdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSB7XG5cdFx0XHRjb25zdHJhaW50Lm1peCA9IGNvbnN0cmFpbnQuZGF0YS5taXggKyAobWl4IC0gY29uc3RyYWludC5kYXRhLm1peCkgKiBhbHBoYTtcblx0XHRcdGNvbnN0cmFpbnQuc29mdG5lc3MgPSBjb25zdHJhaW50LmRhdGEuc29mdG5lc3MgKyAoc29mdG5lc3MgLSBjb25zdHJhaW50LmRhdGEuc29mdG5lc3MpICogYWxwaGE7XG5cblx0XHRcdGlmIChkaXJlY3Rpb24gPT0gTWl4RGlyZWN0aW9uLm1peE91dCkge1xuXHRcdFx0XHRjb25zdHJhaW50LmJlbmREaXJlY3Rpb24gPSBjb25zdHJhaW50LmRhdGEuYmVuZERpcmVjdGlvbjtcblx0XHRcdFx0Y29uc3RyYWludC5jb21wcmVzcyA9IGNvbnN0cmFpbnQuZGF0YS5jb21wcmVzcztcblx0XHRcdFx0Y29uc3RyYWludC5zdHJldGNoID0gY29uc3RyYWludC5kYXRhLnN0cmV0Y2g7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdHJhaW50LmJlbmREaXJlY3Rpb24gPSBmcmFtZXNbaSArIDMvKkJFTkRfRElSRUNUSU9OKi9dO1xuXHRcdFx0XHRjb25zdHJhaW50LmNvbXByZXNzID0gZnJhbWVzW2kgKyA0LypDT01QUkVTUyovXSAhPSAwO1xuXHRcdFx0XHRjb25zdHJhaW50LnN0cmV0Y2ggPSBmcmFtZXNbaSArIDUvKlNUUkVUQ0gqL10gIT0gMDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3RyYWludC5taXggKz0gKG1peCAtIGNvbnN0cmFpbnQubWl4KSAqIGFscGhhO1xuXHRcdFx0Y29uc3RyYWludC5zb2Z0bmVzcyArPSAoc29mdG5lc3MgLSBjb25zdHJhaW50LnNvZnRuZXNzKSAqIGFscGhhO1xuXHRcdFx0aWYgKGRpcmVjdGlvbiA9PSBNaXhEaXJlY3Rpb24ubWl4SW4pIHtcblx0XHRcdFx0Y29uc3RyYWludC5iZW5kRGlyZWN0aW9uID0gZnJhbWVzW2kgKyAzLypCRU5EX0RJUkVDVElPTiovXTtcblx0XHRcdFx0Y29uc3RyYWludC5jb21wcmVzcyA9IGZyYW1lc1tpICsgNC8qQ09NUFJFU1MqL10gIT0gMDtcblx0XHRcdFx0Y29uc3RyYWludC5zdHJldGNoID0gZnJhbWVzW2kgKyA1LypTVFJFVENIKi9dICE9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgdHJhbnNmb3JtIGNvbnN0cmFpbnQncyB7QGxpbmsgVHJhbnNmb3JtQ29uc3RyYWludCNyb3RhdGVNaXh9LCB7QGxpbmsgVHJhbnNmb3JtQ29uc3RyYWludCN0cmFuc2xhdGVNaXh9LFxuICoge0BsaW5rIFRyYW5zZm9ybUNvbnN0cmFpbnQjc2NhbGVNaXh9LCBhbmQge0BsaW5rIFRyYW5zZm9ybUNvbnN0cmFpbnQjc2hlYXJNaXh9LiAqL1xuZXhwb3J0IGNsYXNzIFRyYW5zZm9ybUNvbnN0cmFpbnRUaW1lbGluZSBleHRlbmRzIEN1cnZlVGltZWxpbmUge1xuXHQvKiogVGhlIGluZGV4IG9mIHRoZSB0cmFuc2Zvcm0gY29uc3RyYWludCBzbG90IGluIHtAbGluayBTa2VsZXRvbiN0cmFuc2Zvcm1Db25zdHJhaW50c30gdGhhdCB3aWxsIGJlIGNoYW5nZWQuICovXG5cdGNvbnN0cmFpbnRJbmRleDogbnVtYmVyID0gMDtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCB0cmFuc2Zvcm1Db25zdHJhaW50SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBbXG5cdFx0XHRQcm9wZXJ0eS50cmFuc2Zvcm1Db25zdHJhaW50ICsgXCJ8XCIgKyB0cmFuc2Zvcm1Db25zdHJhaW50SW5kZXhcblx0XHRdKTtcblx0XHR0aGlzLmNvbnN0cmFpbnRJbmRleCA9IHRyYW5zZm9ybUNvbnN0cmFpbnRJbmRleDtcblx0fVxuXG5cdGdldEZyYW1lRW50cmllcyAoKSB7XG5cdFx0cmV0dXJuIDcvKkVOVFJJRVMqLztcblx0fVxuXG5cdC8qKiBUaGUgdGltZSBpbiBzZWNvbmRzLCByb3RhdGUgbWl4LCB0cmFuc2xhdGUgbWl4LCBzY2FsZSBtaXgsIGFuZCBzaGVhciBtaXggZm9yIHRoZSBzcGVjaWZpZWQga2V5IGZyYW1lLiAqL1xuXHRzZXRGcmFtZSAoZnJhbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBtaXhSb3RhdGU6IG51bWJlciwgbWl4WDogbnVtYmVyLCBtaXhZOiBudW1iZXIsIG1peFNjYWxlWDogbnVtYmVyLCBtaXhTY2FsZVk6IG51bWJlcixcblx0XHRtaXhTaGVhclk6IG51bWJlcikge1xuXHRcdGxldCBmcmFtZXMgPSB0aGlzLmZyYW1lcztcblx0XHRmcmFtZSAqPSA3LypFTlRSSUVTKi87XG5cdFx0ZnJhbWVzW2ZyYW1lXSA9IHRpbWU7XG5cdFx0ZnJhbWVzW2ZyYW1lICsgMS8qUk9UQVRFKi9dID0gbWl4Um90YXRlO1xuXHRcdGZyYW1lc1tmcmFtZSArIDIvKlgqL10gPSBtaXhYO1xuXHRcdGZyYW1lc1tmcmFtZSArIDMvKlkqL10gPSBtaXhZO1xuXHRcdGZyYW1lc1tmcmFtZSArIDQvKlNDQUxFWCovXSA9IG1peFNjYWxlWDtcblx0XHRmcmFtZXNbZnJhbWUgKyA1LypTQ0FMRVkqL10gPSBtaXhTY2FsZVk7XG5cdFx0ZnJhbWVzW2ZyYW1lICsgNi8qU0hFQVJZKi9dID0gbWl4U2hlYXJZO1xuXHR9XG5cblx0YXBwbHkgKHNrZWxldG9uOiBTa2VsZXRvbiwgbGFzdFRpbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBmaXJlZEV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IGNvbnN0cmFpbnQ6IFRyYW5zZm9ybUNvbnN0cmFpbnQgPSBza2VsZXRvbi50cmFuc2Zvcm1Db25zdHJhaW50c1t0aGlzLmNvbnN0cmFpbnRJbmRleF07XG5cdFx0aWYgKCFjb25zdHJhaW50LmFjdGl2ZSkgcmV0dXJuO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGlmICh0aW1lIDwgZnJhbWVzWzBdKSB7XG5cdFx0XHRsZXQgZGF0YSA9IGNvbnN0cmFpbnQuZGF0YTtcblx0XHRcdHN3aXRjaCAoYmxlbmQpIHtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5zZXR1cDpcblx0XHRcdFx0XHRjb25zdHJhaW50Lm1peFJvdGF0ZSA9IGRhdGEubWl4Um90YXRlO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4WCA9IGRhdGEubWl4WDtcblx0XHRcdFx0XHRjb25zdHJhaW50Lm1peFkgPSBkYXRhLm1peFk7XG5cdFx0XHRcdFx0Y29uc3RyYWludC5taXhTY2FsZVggPSBkYXRhLm1peFNjYWxlWDtcblx0XHRcdFx0XHRjb25zdHJhaW50Lm1peFNjYWxlWSA9IGRhdGEubWl4U2NhbGVZO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4U2hlYXJZID0gZGF0YS5taXhTaGVhclk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlIE1peEJsZW5kLmZpcnN0OlxuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4Um90YXRlICs9IChkYXRhLm1peFJvdGF0ZSAtIGNvbnN0cmFpbnQubWl4Um90YXRlKSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4WCArPSAoZGF0YS5taXhYIC0gY29uc3RyYWludC5taXhYKSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4WSArPSAoZGF0YS5taXhZIC0gY29uc3RyYWludC5taXhZKSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4U2NhbGVYICs9IChkYXRhLm1peFNjYWxlWCAtIGNvbnN0cmFpbnQubWl4U2NhbGVYKSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4U2NhbGVZICs9IChkYXRhLm1peFNjYWxlWSAtIGNvbnN0cmFpbnQubWl4U2NhbGVZKSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4U2hlYXJZICs9IChkYXRhLm1peFNoZWFyWSAtIGNvbnN0cmFpbnQubWl4U2hlYXJZKSAqIGFscGhhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCByb3RhdGUsIHgsIHksIHNjYWxlWCwgc2NhbGVZLCBzaGVhclk7XG5cdFx0bGV0IGkgPSBUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCA3LypFTlRSSUVTKi8pO1xuXHRcdGxldCBjdXJ2ZVR5cGUgPSB0aGlzLmN1cnZlc1tpIC8gNy8qRU5UUklFUyovXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0cm90YXRlID0gZnJhbWVzW2kgKyAxLypST1RBVEUqL107XG5cdFx0XHRcdHggPSBmcmFtZXNbaSArIDIvKlgqL107XG5cdFx0XHRcdHkgPSBmcmFtZXNbaSArIDMvKlkqL107XG5cdFx0XHRcdHNjYWxlWCA9IGZyYW1lc1tpICsgNC8qU0NBTEVYKi9dO1xuXHRcdFx0XHRzY2FsZVkgPSBmcmFtZXNbaSArIDUvKlNDQUxFWSovXTtcblx0XHRcdFx0c2hlYXJZID0gZnJhbWVzW2kgKyA2LypTSEVBUlkqL107XG5cdFx0XHRcdGxldCB0ID0gKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgNy8qRU5UUklFUyovXSAtIGJlZm9yZSk7XG5cdFx0XHRcdHJvdGF0ZSArPSAoZnJhbWVzW2kgKyA3LypFTlRSSUVTKi8gKyAxLypST1RBVEUqL10gLSByb3RhdGUpICogdDtcblx0XHRcdFx0eCArPSAoZnJhbWVzW2kgKyA3LypFTlRSSUVTKi8gKyAyLypYKi9dIC0geCkgKiB0O1xuXHRcdFx0XHR5ICs9IChmcmFtZXNbaSArIDcvKkVOVFJJRVMqLyArIDMvKlkqL10gLSB5KSAqIHQ7XG5cdFx0XHRcdHNjYWxlWCArPSAoZnJhbWVzW2kgKyA3LypFTlRSSUVTKi8gKyA0LypTQ0FMRVgqL10gLSBzY2FsZVgpICogdDtcblx0XHRcdFx0c2NhbGVZICs9IChmcmFtZXNbaSArIDcvKkVOVFJJRVMqLyArIDUvKlNDQUxFWSovXSAtIHNjYWxlWSkgKiB0O1xuXHRcdFx0XHRzaGVhclkgKz0gKGZyYW1lc1tpICsgNy8qRU5UUklFUyovICsgNi8qU0hFQVJZKi9dIC0gc2hlYXJZKSAqIHQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAxLypTVEVQUEVEKi86XG5cdFx0XHRcdHJvdGF0ZSA9IGZyYW1lc1tpICsgMS8qUk9UQVRFKi9dO1xuXHRcdFx0XHR4ID0gZnJhbWVzW2kgKyAyLypYKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAzLypZKi9dO1xuXHRcdFx0XHRzY2FsZVggPSBmcmFtZXNbaSArIDQvKlNDQUxFWCovXTtcblx0XHRcdFx0c2NhbGVZID0gZnJhbWVzW2kgKyA1LypTQ0FMRVkqL107XG5cdFx0XHRcdHNoZWFyWSA9IGZyYW1lc1tpICsgNi8qU0hFQVJZKi9dO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJvdGF0ZSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMS8qUk9UQVRFKi8sIGN1cnZlVHlwZSAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eCA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qWCovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMy8qWSovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDIgLSAyLypCRVpJRVIqLyk7XG5cdFx0XHRcdHNjYWxlWCA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgNC8qU0NBTEVYKi8sIGN1cnZlVHlwZSArIDE4LypCRVpJRVJfU0laRSovICogMyAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0c2NhbGVZID0gdGhpcy5nZXRCZXppZXJWYWx1ZSh0aW1lLCBpLCA1LypTQ0FMRVkqLywgY3VydmVUeXBlICsgMTgvKkJFWklFUl9TSVpFKi8gKiA0IC0gMi8qQkVaSUVSKi8pO1xuXHRcdFx0XHRzaGVhclkgPSB0aGlzLmdldEJlemllclZhbHVlKHRpbWUsIGksIDYvKlNIRUFSWSovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDUgLSAyLypCRVpJRVIqLyk7XG5cdFx0fVxuXG5cdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSB7XG5cdFx0XHRsZXQgZGF0YSA9IGNvbnN0cmFpbnQuZGF0YTtcblx0XHRcdGNvbnN0cmFpbnQubWl4Um90YXRlID0gZGF0YS5taXhSb3RhdGUgKyAocm90YXRlIC0gZGF0YS5taXhSb3RhdGUpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFggPSBkYXRhLm1peFggKyAoeCAtIGRhdGEubWl4WCkgKiBhbHBoYTtcblx0XHRcdGNvbnN0cmFpbnQubWl4WSA9IGRhdGEubWl4WSArICh5IC0gZGF0YS5taXhZKSAqIGFscGhhO1xuXHRcdFx0Y29uc3RyYWludC5taXhTY2FsZVggPSBkYXRhLm1peFNjYWxlWCArIChzY2FsZVggLSBkYXRhLm1peFNjYWxlWCkgKiBhbHBoYTtcblx0XHRcdGNvbnN0cmFpbnQubWl4U2NhbGVZID0gZGF0YS5taXhTY2FsZVkgKyAoc2NhbGVZIC0gZGF0YS5taXhTY2FsZVkpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFNoZWFyWSA9IGRhdGEubWl4U2hlYXJZICsgKHNoZWFyWSAtIGRhdGEubWl4U2hlYXJZKSAqIGFscGhhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdHJhaW50Lm1peFJvdGF0ZSArPSAocm90YXRlIC0gY29uc3RyYWludC5taXhSb3RhdGUpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFggKz0gKHggLSBjb25zdHJhaW50Lm1peFgpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFkgKz0gKHkgLSBjb25zdHJhaW50Lm1peFkpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFNjYWxlWCArPSAoc2NhbGVYIC0gY29uc3RyYWludC5taXhTY2FsZVgpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFNjYWxlWSArPSAoc2NhbGVZIC0gY29uc3RyYWludC5taXhTY2FsZVkpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFNoZWFyWSArPSAoc2hlYXJZIC0gY29uc3RyYWludC5taXhTaGVhclkpICogYWxwaGE7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgcGF0aCBjb25zdHJhaW50J3Mge0BsaW5rIFBhdGhDb25zdHJhaW50I3Bvc2l0aW9ufS4gKi9cbmV4cG9ydCBjbGFzcyBQYXRoQ29uc3RyYWludFBvc2l0aW9uVGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lMSB7XG5cdC8qKiBUaGUgaW5kZXggb2YgdGhlIHBhdGggY29uc3RyYWludCBpbiB7QGxpbmsgU2tlbGV0b24jZ2V0UGF0aENvbnN0cmFpbnRzKCl9IHRoYXQgd2lsbCBiZSBjaGFuZ2VkIHdoZW4gdGhpcyB0aW1lbGluZSBpc1xuXHQgKiBhcHBsaWVkLiAqL1xuXHRjb25zdHJhaW50SW5kZXg6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcGF0aENvbnN0cmFpbnRJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFByb3BlcnR5LnBhdGhDb25zdHJhaW50UG9zaXRpb24gKyBcInxcIiArIHBhdGhDb25zdHJhaW50SW5kZXgpO1xuXHRcdHRoaXMuY29uc3RyYWludEluZGV4ID0gcGF0aENvbnN0cmFpbnRJbmRleDtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZmlyZWRFdmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBjb25zdHJhaW50OiBQYXRoQ29uc3RyYWludCA9IHNrZWxldG9uLnBhdGhDb25zdHJhaW50c1t0aGlzLmNvbnN0cmFpbnRJbmRleF07XG5cdFx0aWYgKGNvbnN0cmFpbnQuYWN0aXZlKVxuXHRcdFx0Y29uc3RyYWludC5wb3NpdGlvbiA9IHRoaXMuZ2V0QWJzb2x1dGVWYWx1ZSh0aW1lLCBhbHBoYSwgYmxlbmQsIGNvbnN0cmFpbnQucG9zaXRpb24sIGNvbnN0cmFpbnQuZGF0YS5wb3NpdGlvbik7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBwYXRoIGNvbnN0cmFpbnQncyB7QGxpbmsgUGF0aENvbnN0cmFpbnQjc3BhY2luZ30uICovXG5leHBvcnQgY2xhc3MgUGF0aENvbnN0cmFpbnRTcGFjaW5nVGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lMSB7XG5cdC8qKiBUaGUgaW5kZXggb2YgdGhlIHBhdGggY29uc3RyYWludCBpbiB7QGxpbmsgU2tlbGV0b24jZ2V0UGF0aENvbnN0cmFpbnRzKCl9IHRoYXQgd2lsbCBiZSBjaGFuZ2VkIHdoZW4gdGhpcyB0aW1lbGluZSBpc1xuXHQgKiBhcHBsaWVkLiAqL1xuXHRjb25zdHJhaW50SW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIHBhdGhDb25zdHJhaW50SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBQcm9wZXJ0eS5wYXRoQ29uc3RyYWludFNwYWNpbmcgKyBcInxcIiArIHBhdGhDb25zdHJhaW50SW5kZXgpO1xuXHRcdHRoaXMuY29uc3RyYWludEluZGV4ID0gcGF0aENvbnN0cmFpbnRJbmRleDtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZmlyZWRFdmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBjb25zdHJhaW50OiBQYXRoQ29uc3RyYWludCA9IHNrZWxldG9uLnBhdGhDb25zdHJhaW50c1t0aGlzLmNvbnN0cmFpbnRJbmRleF07XG5cdFx0aWYgKGNvbnN0cmFpbnQuYWN0aXZlKVxuXHRcdFx0Y29uc3RyYWludC5zcGFjaW5nID0gdGhpcy5nZXRBYnNvbHV0ZVZhbHVlKHRpbWUsIGFscGhhLCBibGVuZCwgY29uc3RyYWludC5zcGFjaW5nLCBjb25zdHJhaW50LmRhdGEuc3BhY2luZyk7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSB0cmFuc2Zvcm0gY29uc3RyYWludCdzIHtAbGluayBQYXRoQ29uc3RyYWludCNnZXRNaXhSb3RhdGUoKX0sIHtAbGluayBQYXRoQ29uc3RyYWludCNnZXRNaXhYKCl9LCBhbmRcbiAqIHtAbGluayBQYXRoQ29uc3RyYWludCNnZXRNaXhZKCl9LiAqL1xuZXhwb3J0IGNsYXNzIFBhdGhDb25zdHJhaW50TWl4VGltZWxpbmUgZXh0ZW5kcyBDdXJ2ZVRpbWVsaW5lIHtcblx0LyoqIFRoZSBpbmRleCBvZiB0aGUgcGF0aCBjb25zdHJhaW50IGluIHtAbGluayBTa2VsZXRvbiNnZXRQYXRoQ29uc3RyYWludHMoKX0gdGhhdCB3aWxsIGJlIGNoYW5nZWQgd2hlbiB0aGlzIHRpbWVsaW5lIGlzXG5cdCAqIGFwcGxpZWQuICovXG5cdGNvbnN0cmFpbnRJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcGF0aENvbnN0cmFpbnRJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIFtcblx0XHRcdFByb3BlcnR5LnBhdGhDb25zdHJhaW50TWl4ICsgXCJ8XCIgKyBwYXRoQ29uc3RyYWludEluZGV4XG5cdFx0XSk7XG5cdFx0dGhpcy5jb25zdHJhaW50SW5kZXggPSBwYXRoQ29uc3RyYWludEluZGV4O1xuXHR9XG5cblx0Z2V0RnJhbWVFbnRyaWVzICgpIHtcblx0XHRyZXR1cm4gNC8qRU5UUklFUyovO1xuXHR9XG5cblx0c2V0RnJhbWUgKGZyYW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgbWl4Um90YXRlOiBudW1iZXIsIG1peFg6IG51bWJlciwgbWl4WTogbnVtYmVyKSB7XG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGZyYW1lIDw8PSAyO1xuXHRcdGZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdGZyYW1lc1tmcmFtZSArIDEvKlJPVEFURSovXSA9IG1peFJvdGF0ZTtcblx0XHRmcmFtZXNbZnJhbWUgKyAyLypYKi9dID0gbWl4WDtcblx0XHRmcmFtZXNbZnJhbWUgKyAzLypZKi9dID0gbWl4WTtcblx0fVxuXG5cdGFwcGx5IChza2VsZXRvbjogU2tlbGV0b24sIGxhc3RUaW1lOiBudW1iZXIsIHRpbWU6IG51bWJlciwgZmlyZWRFdmVudHM6IEFycmF5PEV2ZW50PiwgYWxwaGE6IG51bWJlciwgYmxlbmQ6IE1peEJsZW5kLCBkaXJlY3Rpb246IE1peERpcmVjdGlvbikge1xuXHRcdGxldCBjb25zdHJhaW50OiBQYXRoQ29uc3RyYWludCA9IHNrZWxldG9uLnBhdGhDb25zdHJhaW50c1t0aGlzLmNvbnN0cmFpbnRJbmRleF07XG5cdFx0aWYgKCFjb25zdHJhaW50LmFjdGl2ZSkgcmV0dXJuO1xuXG5cdFx0bGV0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXHRcdGlmICh0aW1lIDwgZnJhbWVzWzBdKSB7XG5cdFx0XHRzd2l0Y2ggKGJsZW5kKSB7XG5cdFx0XHRcdGNhc2UgTWl4QmxlbmQuc2V0dXA6XG5cdFx0XHRcdFx0Y29uc3RyYWludC5taXhSb3RhdGUgPSBjb25zdHJhaW50LmRhdGEubWl4Um90YXRlO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4WCA9IGNvbnN0cmFpbnQuZGF0YS5taXhYO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4WSA9IGNvbnN0cmFpbnQuZGF0YS5taXhZO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBNaXhCbGVuZC5maXJzdDpcblx0XHRcdFx0XHRjb25zdHJhaW50Lm1peFJvdGF0ZSArPSAoY29uc3RyYWludC5kYXRhLm1peFJvdGF0ZSAtIGNvbnN0cmFpbnQubWl4Um90YXRlKSAqIGFscGhhO1xuXHRcdFx0XHRcdGNvbnN0cmFpbnQubWl4WCArPSAoY29uc3RyYWludC5kYXRhLm1peFggLSBjb25zdHJhaW50Lm1peFgpICogYWxwaGE7XG5cdFx0XHRcdFx0Y29uc3RyYWludC5taXhZICs9IChjb25zdHJhaW50LmRhdGEubWl4WSAtIGNvbnN0cmFpbnQubWl4WSkgKiBhbHBoYTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcm90YXRlLCB4LCB5O1xuXHRcdGxldCBpID0gVGltZWxpbmUuc2VhcmNoKGZyYW1lcywgdGltZSwgNC8qRU5UUklFUyovKTtcblx0XHRsZXQgY3VydmVUeXBlID0gdGhpcy5jdXJ2ZXNbaSA+PiAyXTtcblx0XHRzd2l0Y2ggKGN1cnZlVHlwZSkge1xuXHRcdFx0Y2FzZSAwLypMSU5FQVIqLzpcblx0XHRcdFx0bGV0IGJlZm9yZSA9IGZyYW1lc1tpXTtcblx0XHRcdFx0cm90YXRlID0gZnJhbWVzW2kgKyAxLypST1RBVEUqL107XG5cdFx0XHRcdHggPSBmcmFtZXNbaSArIDIvKlgqL107XG5cdFx0XHRcdHkgPSBmcmFtZXNbaSArIDMvKlkqL107XG5cdFx0XHRcdGxldCB0ID0gKHRpbWUgLSBiZWZvcmUpIC8gKGZyYW1lc1tpICsgNC8qRU5UUklFUyovXSAtIGJlZm9yZSk7XG5cdFx0XHRcdHJvdGF0ZSArPSAoZnJhbWVzW2kgKyA0LypFTlRSSUVTKi8gKyAxLypST1RBVEUqL10gLSByb3RhdGUpICogdDtcblx0XHRcdFx0eCArPSAoZnJhbWVzW2kgKyA0LypFTlRSSUVTKi8gKyAyLypYKi9dIC0geCkgKiB0O1xuXHRcdFx0XHR5ICs9IChmcmFtZXNbaSArIDQvKkVOVFJJRVMqLyArIDMvKlkqL10gLSB5KSAqIHQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAxLypTVEVQUEVEKi86XG5cdFx0XHRcdHJvdGF0ZSA9IGZyYW1lc1tpICsgMS8qUk9UQVRFKi9dO1xuXHRcdFx0XHR4ID0gZnJhbWVzW2kgKyAyLypYKi9dO1xuXHRcdFx0XHR5ID0gZnJhbWVzW2kgKyAzLypZKi9dO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJvdGF0ZSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMS8qUk9UQVRFKi8sIGN1cnZlVHlwZSAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eCA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMi8qWCovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAtIDIvKkJFWklFUiovKTtcblx0XHRcdFx0eSA9IHRoaXMuZ2V0QmV6aWVyVmFsdWUodGltZSwgaSwgMy8qWSovLCBjdXJ2ZVR5cGUgKyAxOC8qQkVaSUVSX1NJWkUqLyAqIDIgLSAyLypCRVpJRVIqLyk7XG5cdFx0fVxuXG5cdFx0aWYgKGJsZW5kID09IE1peEJsZW5kLnNldHVwKSB7XG5cdFx0XHRsZXQgZGF0YSA9IGNvbnN0cmFpbnQuZGF0YTtcblx0XHRcdGNvbnN0cmFpbnQubWl4Um90YXRlID0gZGF0YS5taXhSb3RhdGUgKyAocm90YXRlIC0gZGF0YS5taXhSb3RhdGUpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFggPSBkYXRhLm1peFggKyAoeCAtIGRhdGEubWl4WCkgKiBhbHBoYTtcblx0XHRcdGNvbnN0cmFpbnQubWl4WSA9IGRhdGEubWl4WSArICh5IC0gZGF0YS5taXhZKSAqIGFscGhhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdHJhaW50Lm1peFJvdGF0ZSArPSAocm90YXRlIC0gY29uc3RyYWludC5taXhSb3RhdGUpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFggKz0gKHggLSBjb25zdHJhaW50Lm1peFgpICogYWxwaGE7XG5cdFx0XHRjb25zdHJhaW50Lm1peFkgKz0gKHkgLSBjb25zdHJhaW50Lm1peFkpICogYWxwaGE7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBUaGUgYmFzZSBjbGFzcyBmb3IgbW9zdCB7QGxpbmsgUGh5c2ljc0NvbnN0cmFpbnR9IHRpbWVsaW5lcy4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBQaHlzaWNzQ29uc3RyYWludFRpbWVsaW5lIGV4dGVuZHMgQ3VydmVUaW1lbGluZTEge1xuXHQvKiogVGhlIGluZGV4IG9mIHRoZSBwaHlzaWNzIGNvbnN0cmFpbnQgaW4ge0BsaW5rIFNrZWxldG9uI2dldFBoeXNpY3NDb25zdHJhaW50cygpfSB0aGF0IHdpbGwgYmUgY2hhbmdlZCB3aGVuIHRoaXMgdGltZWxpbmVcblx0ICogaXMgYXBwbGllZCwgb3IgLTEgaWYgYWxsIHBoeXNpY3MgY29uc3RyYWludHMgaW4gdGhlIHNrZWxldG9uIHdpbGwgYmUgY2hhbmdlZC4gKi9cblx0Y29uc3RyYWludEluZGV4ID0gMDtcblxuXHQvKiogQHBhcmFtIHBoeXNpY3NDb25zdHJhaW50SW5kZXggLTEgZm9yIGFsbCBwaHlzaWNzIGNvbnN0cmFpbnRzIGluIHRoZSBza2VsZXRvbi4gKi9cblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcGh5c2ljc0NvbnN0cmFpbnRJbmRleDogbnVtYmVyLCBwcm9wZXJ0eTogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIHByb3BlcnR5ICsgXCJ8XCIgKyBwaHlzaWNzQ29uc3RyYWludEluZGV4KTtcblx0XHR0aGlzLmNvbnN0cmFpbnRJbmRleCA9IHBoeXNpY3NDb25zdHJhaW50SW5kZXg7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGZpcmVkRXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblx0XHRsZXQgY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQ7XG5cdFx0aWYgKHRoaXMuY29uc3RyYWludEluZGV4ID09IC0xKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRpbWUgPj0gdGhpcy5mcmFtZXNbMF0gPyB0aGlzLmdldEN1cnZlVmFsdWUodGltZSkgOiAwO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNvbnN0cmFpbnQgb2Ygc2tlbGV0b24ucGh5c2ljc0NvbnN0cmFpbnRzKSB7XG5cdFx0XHRcdGlmIChjb25zdHJhaW50LmFjdGl2ZSAmJiB0aGlzLmdsb2JhbChjb25zdHJhaW50LmRhdGEpKVxuXHRcdFx0XHRcdHRoaXMuc2V0KGNvbnN0cmFpbnQsIHRoaXMuZ2V0QWJzb2x1dGVWYWx1ZTIodGltZSwgYWxwaGEsIGJsZW5kLCB0aGlzLmdldChjb25zdHJhaW50KSwgdGhpcy5zZXR1cChjb25zdHJhaW50KSwgdmFsdWUpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3RyYWludCA9IHNrZWxldG9uLnBoeXNpY3NDb25zdHJhaW50c1t0aGlzLmNvbnN0cmFpbnRJbmRleF07XG5cdFx0XHRpZiAoY29uc3RyYWludC5hY3RpdmUpIHRoaXMuc2V0KGNvbnN0cmFpbnQsIHRoaXMuZ2V0QWJzb2x1dGVWYWx1ZSh0aW1lLCBhbHBoYSwgYmxlbmQsIHRoaXMuZ2V0KGNvbnN0cmFpbnQpLCB0aGlzLnNldHVwKGNvbnN0cmFpbnQpKSk7XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3Qgc2V0dXAgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyO1xuXG5cdGFic3RyYWN0IGdldCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQpOiBudW1iZXI7XG5cblx0YWJzdHJhY3Qgc2V0IChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludCwgdmFsdWU6IG51bWJlcik6IHZvaWQ7XG5cblx0YWJzdHJhY3QgZ2xvYmFsIChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludERhdGEpOiBib29sZWFuO1xufVxuXG4vKiogQ2hhbmdlcyBhIHBoeXNpY3MgY29uc3RyYWludCdzIHtAbGluayBQaHlzaWNzQ29uc3RyYWludCNnZXRJbmVydGlhKCl9LiAqL1xuZXhwb3J0IGNsYXNzIFBoeXNpY3NDb25zdHJhaW50SW5lcnRpYVRpbWVsaW5lIGV4dGVuZHMgUGh5c2ljc0NvbnN0cmFpbnRUaW1lbGluZSB7XG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIHBoeXNpY3NDb25zdHJhaW50SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBwaHlzaWNzQ29uc3RyYWludEluZGV4LCBQcm9wZXJ0eS5waHlzaWNzQ29uc3RyYWludEluZXJ0aWEpO1xuXHR9XG5cblx0c2V0dXAgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC5kYXRhLmluZXJ0aWE7XG5cdH1cblxuXHRnZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC5pbmVydGlhO1xuXHR9XG5cblx0c2V0IChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludCwgdmFsdWU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0cmFpbnQuaW5lcnRpYSA9IHZhbHVlO1xuXHR9XG5cblx0Z2xvYmFsIChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludERhdGEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC5pbmVydGlhR2xvYmFsO1xuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgcGh5c2ljcyBjb25zdHJhaW50J3Mge0BsaW5rIFBoeXNpY3NDb25zdHJhaW50I2dldFN0cmVuZ3RoKCl9LiAqL1xuZXhwb3J0IGNsYXNzIFBoeXNpY3NDb25zdHJhaW50U3RyZW5ndGhUaW1lbGluZSBleHRlbmRzIFBoeXNpY3NDb25zdHJhaW50VGltZWxpbmUge1xuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBwaHlzaWNzQ29uc3RyYWludEluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBiZXppZXJDb3VudCwgcGh5c2ljc0NvbnN0cmFpbnRJbmRleCwgUHJvcGVydHkucGh5c2ljc0NvbnN0cmFpbnRTdHJlbmd0aCk7XG5cdH1cblxuXHRzZXR1cCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmRhdGEuc3RyZW5ndGg7XG5cdH1cblxuXHRnZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC5zdHJlbmd0aDtcblx0fVxuXG5cdHNldCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQsIHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdHJhaW50LnN0cmVuZ3RoID0gdmFsdWU7XG5cdH1cblxuXHRnbG9iYWwgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50RGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb25zdHJhaW50LnN0cmVuZ3RoR2xvYmFsO1xuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgcGh5c2ljcyBjb25zdHJhaW50J3Mge0BsaW5rIFBoeXNpY3NDb25zdHJhaW50I2dldERhbXBpbmcoKX0uICovXG5leHBvcnQgY2xhc3MgUGh5c2ljc0NvbnN0cmFpbnREYW1waW5nVGltZWxpbmUgZXh0ZW5kcyBQaHlzaWNzQ29uc3RyYWludFRpbWVsaW5lIHtcblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcGh5c2ljc0NvbnN0cmFpbnRJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIHBoeXNpY3NDb25zdHJhaW50SW5kZXgsIFByb3BlcnR5LnBoeXNpY3NDb25zdHJhaW50RGFtcGluZyk7XG5cdH1cblxuXHRzZXR1cCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmRhdGEuZGFtcGluZztcblx0fVxuXG5cdGdldCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmRhbXBpbmc7XG5cdH1cblxuXHRzZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50LCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3RyYWludC5kYW1waW5nID0gdmFsdWU7XG5cdH1cblxuXHRnbG9iYWwgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50RGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmRhbXBpbmdHbG9iYWw7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBwaHlzaWNzIGNvbnN0cmFpbnQncyB7QGxpbmsgUGh5c2ljc0NvbnN0cmFpbnQjZ2V0TWFzc0ludmVyc2UoKX0uIFRoZSB0aW1lbGluZSB2YWx1ZXMgYXJlIG5vdCBpbnZlcnRlZC4gKi9cbmV4cG9ydCBjbGFzcyBQaHlzaWNzQ29uc3RyYWludE1hc3NUaW1lbGluZSBleHRlbmRzIFBoeXNpY3NDb25zdHJhaW50VGltZWxpbmUge1xuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBiZXppZXJDb3VudDogbnVtYmVyLCBwaHlzaWNzQ29uc3RyYWludEluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBiZXppZXJDb3VudCwgcGh5c2ljc0NvbnN0cmFpbnRJbmRleCwgUHJvcGVydHkucGh5c2ljc0NvbnN0cmFpbnRNYXNzKTtcblx0fVxuXG5cdHNldHVwIChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDEgLyBjb25zdHJhaW50LmRhdGEubWFzc0ludmVyc2U7XG5cdH1cblxuXHRnZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMSAvIGNvbnN0cmFpbnQubWFzc0ludmVyc2U7XG5cdH1cblxuXHRzZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50LCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3RyYWludC5tYXNzSW52ZXJzZSA9IDEgLyB2YWx1ZTtcblx0fVxuXG5cdGdsb2JhbCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnREYXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbnN0cmFpbnQubWFzc0dsb2JhbDtcblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIHBoeXNpY3MgY29uc3RyYWludCdzIHtAbGluayBQaHlzaWNzQ29uc3RyYWludCNnZXRXaW5kKCl9LiAqL1xuZXhwb3J0IGNsYXNzIFBoeXNpY3NDb25zdHJhaW50V2luZFRpbWVsaW5lIGV4dGVuZHMgUGh5c2ljc0NvbnN0cmFpbnRUaW1lbGluZSB7XG5cdGNvbnN0cnVjdG9yIChmcmFtZUNvdW50OiBudW1iZXIsIGJlemllckNvdW50OiBudW1iZXIsIHBoeXNpY3NDb25zdHJhaW50SW5kZXg6IG51bWJlcikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIGJlemllckNvdW50LCBwaHlzaWNzQ29uc3RyYWludEluZGV4LCBQcm9wZXJ0eS5waHlzaWNzQ29uc3RyYWludFdpbmQpO1xuXHR9XG5cblx0c2V0dXAgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC5kYXRhLndpbmQ7XG5cdH1cblxuXHRnZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC53aW5kO1xuXHR9XG5cblx0c2V0IChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludCwgdmFsdWU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0cmFpbnQud2luZCA9IHZhbHVlO1xuXHR9XG5cblx0Z2xvYmFsIChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludERhdGEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC53aW5kR2xvYmFsO1xuXHR9XG59XG5cbi8qKiBDaGFuZ2VzIGEgcGh5c2ljcyBjb25zdHJhaW50J3Mge0BsaW5rIFBoeXNpY3NDb25zdHJhaW50I2dldEdyYXZpdHkoKX0uICovXG5leHBvcnQgY2xhc3MgUGh5c2ljc0NvbnN0cmFpbnRHcmF2aXR5VGltZWxpbmUgZXh0ZW5kcyBQaHlzaWNzQ29uc3RyYWludFRpbWVsaW5lIHtcblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcGh5c2ljc0NvbnN0cmFpbnRJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIHBoeXNpY3NDb25zdHJhaW50SW5kZXgsIFByb3BlcnR5LnBoeXNpY3NDb25zdHJhaW50R3Jhdml0eSk7XG5cdH1cblxuXHRzZXR1cCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmRhdGEuZ3Jhdml0eTtcblx0fVxuXG5cdGdldCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmdyYXZpdHk7XG5cdH1cblxuXHRzZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50LCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3RyYWludC5ncmF2aXR5ID0gdmFsdWU7XG5cdH1cblxuXHRnbG9iYWwgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50RGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb25zdHJhaW50LmdyYXZpdHlHbG9iYWw7XG5cdH1cbn1cblxuLyoqIENoYW5nZXMgYSBwaHlzaWNzIGNvbnN0cmFpbnQncyB7QGxpbmsgUGh5c2ljc0NvbnN0cmFpbnQjZ2V0TWl4KCl9LiAqL1xuZXhwb3J0IGNsYXNzIFBoeXNpY3NDb25zdHJhaW50TWl4VGltZWxpbmUgZXh0ZW5kcyBQaHlzaWNzQ29uc3RyYWludFRpbWVsaW5lIHtcblx0Y29uc3RydWN0b3IgKGZyYW1lQ291bnQ6IG51bWJlciwgYmV6aWVyQ291bnQ6IG51bWJlciwgcGh5c2ljc0NvbnN0cmFpbnRJbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZnJhbWVDb3VudCwgYmV6aWVyQ291bnQsIHBoeXNpY3NDb25zdHJhaW50SW5kZXgsIFByb3BlcnR5LnBoeXNpY3NDb25zdHJhaW50TWl4KTtcblx0fVxuXG5cdHNldHVwIChjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGNvbnN0cmFpbnQuZGF0YS5taXg7XG5cdH1cblxuXHRnZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29uc3RyYWludC5taXg7XG5cdH1cblxuXHRzZXQgKGNvbnN0cmFpbnQ6IFBoeXNpY3NDb25zdHJhaW50LCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3RyYWludC5taXggPSB2YWx1ZTtcblx0fVxuXG5cdGdsb2JhbCAoY29uc3RyYWludDogUGh5c2ljc0NvbnN0cmFpbnREYXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbnN0cmFpbnQubWl4R2xvYmFsO1xuXHR9XG59XG5cbi8qKiBSZXNldHMgYSBwaHlzaWNzIGNvbnN0cmFpbnQgd2hlbiBzcGVjaWZpYyBhbmltYXRpb24gdGltZXMgYXJlIHJlYWNoZWQuICovXG5leHBvcnQgY2xhc3MgUGh5c2ljc0NvbnN0cmFpbnRSZXNldFRpbWVsaW5lIGV4dGVuZHMgVGltZWxpbmUge1xuXHRwcml2YXRlIHN0YXRpYyBwcm9wZXJ0eUlkczogc3RyaW5nW10gPSBbUHJvcGVydHkucGh5c2ljc0NvbnN0cmFpbnRSZXNldC50b1N0cmluZygpXTtcblxuXHQvKiogVGhlIGluZGV4IG9mIHRoZSBwaHlzaWNzIGNvbnN0cmFpbnQgaW4ge0BsaW5rIFNrZWxldG9uI2dldFBoeXNpY3NDb25zdHJhaW50cygpfSB0aGF0IHdpbGwgYmUgcmVzZXQgd2hlbiB0aGlzIHRpbWVsaW5lIGlzXG5cdCogYXBwbGllZCwgb3IgLTEgaWYgYWxsIHBoeXNpY3MgY29uc3RyYWludHMgaW4gdGhlIHNrZWxldG9uIHdpbGwgYmUgcmVzZXQuICovXG5cdGNvbnN0cmFpbnRJbmRleDogbnVtYmVyO1xuXG5cdC8qKiBAcGFyYW0gcGh5c2ljc0NvbnN0cmFpbnRJbmRleCAtMSBmb3IgYWxsIHBoeXNpY3MgY29uc3RyYWludHMgaW4gdGhlIHNrZWxldG9uLiAqL1xuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBwaHlzaWNzQ29uc3RyYWludEluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcihmcmFtZUNvdW50LCBQaHlzaWNzQ29uc3RyYWludFJlc2V0VGltZWxpbmUucHJvcGVydHlJZHMpO1xuXHRcdHRoaXMuY29uc3RyYWludEluZGV4ID0gcGh5c2ljc0NvbnN0cmFpbnRJbmRleDtcblx0fVxuXG5cdGdldEZyYW1lQ291bnQgKCkge1xuXHRcdHJldHVybiB0aGlzLmZyYW1lcy5sZW5ndGg7XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgdGltZSBmb3IgdGhlIHNwZWNpZmllZCBmcmFtZS5cblx0ICogQHBhcmFtIGZyYW1lIEJldHdlZW4gMCBhbmQgPGNvZGU+ZnJhbWVDb3VudDwvY29kZT4sIGluY2x1c2l2ZS4gKi9cblx0c2V0RnJhbWUgKGZyYW1lOiBudW1iZXIsIHRpbWU6IG51bWJlcikge1xuXHRcdHRoaXMuZnJhbWVzW2ZyYW1lXSA9IHRpbWU7XG5cdH1cblxuXHQvKiogUmVzZXRzIHRoZSBwaHlzaWNzIGNvbnN0cmFpbnQgd2hlbiBmcmFtZXMgPiA8Y29kZT5sYXN0VGltZTwvY29kZT4gYW5kIDw9IDxjb2RlPnRpbWU8L2NvZGU+LiAqL1xuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGZpcmVkRXZlbnRzOiBBcnJheTxFdmVudD4sIGFscGhhOiBudW1iZXIsIGJsZW5kOiBNaXhCbGVuZCwgZGlyZWN0aW9uOiBNaXhEaXJlY3Rpb24pIHtcblxuXHRcdGxldCBjb25zdHJhaW50OiBQaHlzaWNzQ29uc3RyYWludCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5jb25zdHJhaW50SW5kZXggIT0gLTEpIHtcblx0XHRcdGNvbnN0cmFpbnQgPSBza2VsZXRvbi5waHlzaWNzQ29uc3RyYWludHNbdGhpcy5jb25zdHJhaW50SW5kZXhdO1xuXHRcdFx0aWYgKCFjb25zdHJhaW50LmFjdGl2ZSkgcmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZyYW1lcyA9IHRoaXMuZnJhbWVzO1xuXG5cdFx0aWYgKGxhc3RUaW1lID4gdGltZSkgeyAvLyBBcHBseSBhZnRlciBsYXN0VGltZSBmb3IgbG9vcGVkIGFuaW1hdGlvbnMuXG5cdFx0XHR0aGlzLmFwcGx5KHNrZWxldG9uLCBsYXN0VGltZSwgTnVtYmVyLk1BWF9WQUxVRSwgW10sIGFscGhhLCBibGVuZCwgZGlyZWN0aW9uKTtcblx0XHRcdGxhc3RUaW1lID0gLTE7XG5cdFx0fSBlbHNlIGlmIChsYXN0VGltZSA+PSBmcmFtZXNbZnJhbWVzLmxlbmd0aCAtIDFdKSAvLyBMYXN0IHRpbWUgaXMgYWZ0ZXIgbGFzdCBmcmFtZS5cblx0XHRcdHJldHVybjtcblx0XHRpZiAodGltZSA8IGZyYW1lc1swXSkgcmV0dXJuO1xuXG5cdFx0aWYgKGxhc3RUaW1lIDwgZnJhbWVzWzBdIHx8IHRpbWUgPj0gZnJhbWVzW1RpbWVsaW5lLnNlYXJjaDEoZnJhbWVzLCBsYXN0VGltZSkgKyAxXSkge1xuXHRcdFx0aWYgKGNvbnN0cmFpbnQgIT0gbnVsbClcblx0XHRcdFx0Y29uc3RyYWludC5yZXNldCgpO1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY29uc3RyYWludCBvZiBza2VsZXRvbi5waHlzaWNzQ29uc3RyYWludHMpIHtcblx0XHRcdFx0XHRpZiAoY29uc3RyYWludC5hY3RpdmUpIGNvbnN0cmFpbnQucmVzZXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vKiogQ2hhbmdlcyBhIHNsb3QncyB7QGxpbmsgU2xvdCNnZXRTZXF1ZW5jZUluZGV4KCl9IGZvciBhbiBhdHRhY2htZW50J3Mge0BsaW5rIFNlcXVlbmNlfS4gKi9cbmV4cG9ydCBjbGFzcyBTZXF1ZW5jZVRpbWVsaW5lIGV4dGVuZHMgVGltZWxpbmUgaW1wbGVtZW50cyBTbG90VGltZWxpbmUge1xuXHRzdGF0aWMgRU5UUklFUyA9IDM7XG5cdHN0YXRpYyBNT0RFID0gMTtcblx0c3RhdGljIERFTEFZID0gMjtcblxuXHRzbG90SW5kZXg6IG51bWJlcjtcblx0YXR0YWNobWVudDogSGFzVGV4dHVyZVJlZ2lvbjtcblxuXHRjb25zdHJ1Y3RvciAoZnJhbWVDb3VudDogbnVtYmVyLCBzbG90SW5kZXg6IG51bWJlciwgYXR0YWNobWVudDogSGFzVGV4dHVyZVJlZ2lvbikge1xuXHRcdHN1cGVyKGZyYW1lQ291bnQsIFtcblx0XHRcdFByb3BlcnR5LnNlcXVlbmNlICsgXCJ8XCIgKyBzbG90SW5kZXggKyBcInxcIiArIGF0dGFjaG1lbnQuc2VxdWVuY2UhLmlkXG5cdFx0XSk7XG5cdFx0dGhpcy5zbG90SW5kZXggPSBzbG90SW5kZXg7XG5cdFx0dGhpcy5hdHRhY2htZW50ID0gYXR0YWNobWVudDtcblx0fVxuXG5cdGdldEZyYW1lRW50cmllcyAoKSB7XG5cdFx0cmV0dXJuIFNlcXVlbmNlVGltZWxpbmUuRU5UUklFUztcblx0fVxuXG5cdGdldFNsb3RJbmRleCAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuc2xvdEluZGV4O1xuXHR9XG5cblx0Z2V0QXR0YWNobWVudCAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYXR0YWNobWVudCBhcyB1bmtub3duIGFzIEF0dGFjaG1lbnQ7XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgdGltZSwgbW9kZSwgaW5kZXgsIGFuZCBmcmFtZSB0aW1lIGZvciB0aGUgc3BlY2lmaWVkIGZyYW1lLlxuXHQgKiBAcGFyYW0gZnJhbWUgQmV0d2VlbiAwIGFuZCA8Y29kZT5mcmFtZUNvdW50PC9jb2RlPiwgaW5jbHVzaXZlLlxuXHQgKiBAcGFyYW0gdGltZSBTZWNvbmRzIGJldHdlZW4gZnJhbWVzLiAqL1xuXHRzZXRGcmFtZSAoZnJhbWU6IG51bWJlciwgdGltZTogbnVtYmVyLCBtb2RlOiBTZXF1ZW5jZU1vZGUsIGluZGV4OiBudW1iZXIsIGRlbGF5OiBudW1iZXIpIHtcblx0XHRsZXQgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0ZnJhbWUgKj0gU2VxdWVuY2VUaW1lbGluZS5FTlRSSUVTO1xuXHRcdGZyYW1lc1tmcmFtZV0gPSB0aW1lO1xuXHRcdGZyYW1lc1tmcmFtZSArIFNlcXVlbmNlVGltZWxpbmUuTU9ERV0gPSBtb2RlIHwgKGluZGV4IDw8IDQpO1xuXHRcdGZyYW1lc1tmcmFtZSArIFNlcXVlbmNlVGltZWxpbmUuREVMQVldID0gZGVsYXk7XG5cdH1cblxuXHRhcHBseSAoc2tlbGV0b246IFNrZWxldG9uLCBsYXN0VGltZTogbnVtYmVyLCB0aW1lOiBudW1iZXIsIGV2ZW50czogQXJyYXk8RXZlbnQ+LCBhbHBoYTogbnVtYmVyLCBibGVuZDogTWl4QmxlbmQsIGRpcmVjdGlvbjogTWl4RGlyZWN0aW9uKSB7XG5cdFx0bGV0IHNsb3QgPSBza2VsZXRvbi5zbG90c1t0aGlzLnNsb3RJbmRleF07XG5cdFx0aWYgKCFzbG90LmJvbmUuYWN0aXZlKSByZXR1cm47XG5cdFx0bGV0IHNsb3RBdHRhY2htZW50ID0gc2xvdC5hdHRhY2htZW50O1xuXHRcdGxldCBhdHRhY2htZW50ID0gdGhpcy5hdHRhY2htZW50IGFzIHVua25vd24gYXMgQXR0YWNobWVudDtcblx0XHRpZiAoc2xvdEF0dGFjaG1lbnQgIT0gYXR0YWNobWVudCkge1xuXHRcdFx0aWYgKCEoc2xvdEF0dGFjaG1lbnQgaW5zdGFuY2VvZiBWZXJ0ZXhBdHRhY2htZW50KVxuXHRcdFx0XHR8fCAoc2xvdEF0dGFjaG1lbnQgYXMgVmVydGV4QXR0YWNobWVudCkudGltZWxpbmVBdHRhY2htZW50ICE9IGF0dGFjaG1lbnQpIHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZnJhbWVzID0gdGhpcy5mcmFtZXM7XG5cdFx0aWYgKHRpbWUgPCBmcmFtZXNbMF0pIHtcblx0XHRcdGlmIChibGVuZCA9PSBNaXhCbGVuZC5zZXR1cCB8fCBibGVuZCA9PSBNaXhCbGVuZC5maXJzdCkgc2xvdC5zZXF1ZW5jZUluZGV4ID0gLTE7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGkgPSBUaW1lbGluZS5zZWFyY2goZnJhbWVzLCB0aW1lLCBTZXF1ZW5jZVRpbWVsaW5lLkVOVFJJRVMpO1xuXHRcdGxldCBiZWZvcmUgPSBmcmFtZXNbaV07XG5cdFx0bGV0IG1vZGVBbmRJbmRleCA9IGZyYW1lc1tpICsgU2VxdWVuY2VUaW1lbGluZS5NT0RFXTtcblx0XHRsZXQgZGVsYXkgPSBmcmFtZXNbaSArIFNlcXVlbmNlVGltZWxpbmUuREVMQVldO1xuXG5cdFx0aWYgKCF0aGlzLmF0dGFjaG1lbnQuc2VxdWVuY2UpIHJldHVybjtcblx0XHRsZXQgaW5kZXggPSBtb2RlQW5kSW5kZXggPj4gNCwgY291bnQgPSB0aGlzLmF0dGFjaG1lbnQuc2VxdWVuY2UhLnJlZ2lvbnMubGVuZ3RoO1xuXHRcdGxldCBtb2RlID0gU2VxdWVuY2VNb2RlVmFsdWVzW21vZGVBbmRJbmRleCAmIDB4Zl07XG5cdFx0aWYgKG1vZGUgIT0gU2VxdWVuY2VNb2RlLmhvbGQpIHtcblx0XHRcdGluZGV4ICs9ICgoKHRpbWUgLSBiZWZvcmUpIC8gZGVsYXkgKyAwLjAwMDAxKSB8IDApO1xuXHRcdFx0c3dpdGNoIChtb2RlKSB7XG5cdFx0XHRcdGNhc2UgU2VxdWVuY2VNb2RlLm9uY2U6XG5cdFx0XHRcdFx0aW5kZXggPSBNYXRoLm1pbihjb3VudCAtIDEsIGluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTZXF1ZW5jZU1vZGUubG9vcDpcblx0XHRcdFx0XHRpbmRleCAlPSBjb3VudDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTZXF1ZW5jZU1vZGUucGluZ3Bvbmc6IHtcblx0XHRcdFx0XHRsZXQgbiA9IChjb3VudCA8PCAxKSAtIDI7XG5cdFx0XHRcdFx0aW5kZXggPSBuID09IDAgPyAwIDogaW5kZXggJSBuO1xuXHRcdFx0XHRcdGlmIChpbmRleCA+PSBjb3VudCkgaW5kZXggPSBuIC0gaW5kZXg7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBTZXF1ZW5jZU1vZGUub25jZVJldmVyc2U6XG5cdFx0XHRcdFx0aW5kZXggPSBNYXRoLm1heChjb3VudCAtIDEgLSBpbmRleCwgMCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU2VxdWVuY2VNb2RlLmxvb3BSZXZlcnNlOlxuXHRcdFx0XHRcdGluZGV4ID0gY291bnQgLSAxIC0gKGluZGV4ICUgY291bnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNlcXVlbmNlTW9kZS5waW5ncG9uZ1JldmVyc2U6IHtcblx0XHRcdFx0XHRsZXQgbiA9IChjb3VudCA8PCAxKSAtIDI7XG5cdFx0XHRcdFx0aW5kZXggPSBuID09IDAgPyAwIDogKGluZGV4ICsgY291bnQgLSAxKSAlIG47XG5cdFx0XHRcdFx0aWYgKGluZGV4ID49IGNvdW50KSBpbmRleCA9IG4gLSBpbmRleDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRzbG90LnNlcXVlbmNlSW5kZXggPSBpbmRleDtcblx0fVxufVxuIl19