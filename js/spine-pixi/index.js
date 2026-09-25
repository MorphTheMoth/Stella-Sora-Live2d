/** ****************************************************************************
 * Spine Runtimes License Agreement
 * Last updated September 24, 2021. Replaces all prior versions.
 *
 * Copyright (c) 2013-2021, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software
 * or otherwise create derivative works of the Spine Runtimes (collectively,
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
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THE SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/
import './require-shim.js'; // Side effects add require pixi.js to global scope
import './assets/atlasLoader.js'; // Side effects install the loaders into pixi
import './assets/skeletonLoader.js'; // Side effects install the loaders into pixi
import './darktint/DarkTintBatcher.js'; // Side effects install the batcher into pixi
import './SpinePipe.js';
export * from './assets/atlasLoader.js';
export * from './assets/skeletonLoader.js';
export * from './require-shim.js';
export * from './Spine.js';
export * from './SpineDebugRenderer.js';
export * from './SpinePipe.js';
export * from './SpineTexture.js';
export * from '@esotericsoftware/spine-core';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsrRUEyQitFO0FBRS9FLE9BQU8sbUJBQW1CLENBQUMsQ0FBQyxtREFBbUQ7QUFDL0UsT0FBTyx5QkFBeUIsQ0FBQyxDQUFDLDZDQUE2QztBQUMvRSxPQUFPLDRCQUE0QixDQUFDLENBQUMsNkNBQTZDO0FBQ2xGLE9BQU8sK0JBQStCLENBQUMsQ0FBQyw2Q0FBNkM7QUFDckYsT0FBTyxnQkFBZ0IsQ0FBQztBQUV4QixjQUFjLHlCQUF5QixDQUFDO0FBQ3hDLGNBQWMsNEJBQTRCLENBQUM7QUFDM0MsY0FBYyxtQkFBbUIsQ0FBQztBQUNsQyxjQUFjLFlBQVksQ0FBQztBQUMzQixjQUFjLHlCQUF5QixDQUFDO0FBQ3hDLGNBQWMsZ0JBQWdCLENBQUM7QUFDL0IsY0FBYyxtQkFBbUIsQ0FBQztBQUNsQyxjQUFjLDhCQUE4QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAqIFNwaW5lIFJ1bnRpbWVzIExpY2Vuc2UgQWdyZWVtZW50XG4gKiBMYXN0IHVwZGF0ZWQgU2VwdGVtYmVyIDI0LCAyMDIxLiBSZXBsYWNlcyBhbGwgcHJpb3IgdmVyc2lvbnMuXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEzLTIwMjEsIEVzb3RlcmljIFNvZnR3YXJlIExMQ1xuICpcbiAqIEludGVncmF0aW9uIG9mIHRoZSBTcGluZSBSdW50aW1lcyBpbnRvIHNvZnR3YXJlIG9yIG90aGVyd2lzZSBjcmVhdGluZ1xuICogZGVyaXZhdGl2ZSB3b3JrcyBvZiB0aGUgU3BpbmUgUnVudGltZXMgaXMgcGVybWl0dGVkIHVuZGVyIHRoZSB0ZXJtcyBhbmRcbiAqIGNvbmRpdGlvbnMgb2YgU2VjdGlvbiAyIG9mIHRoZSBTcGluZSBFZGl0b3IgTGljZW5zZSBBZ3JlZW1lbnQ6XG4gKiBodHRwOi8vZXNvdGVyaWNzb2Z0d2FyZS5jb20vc3BpbmUtZWRpdG9yLWxpY2Vuc2VcbiAqXG4gKiBPdGhlcndpc2UsIGl0IGlzIHBlcm1pdHRlZCB0byBpbnRlZ3JhdGUgdGhlIFNwaW5lIFJ1bnRpbWVzIGludG8gc29mdHdhcmVcbiAqIG9yIG90aGVyd2lzZSBjcmVhdGUgZGVyaXZhdGl2ZSB3b3JrcyBvZiB0aGUgU3BpbmUgUnVudGltZXMgKGNvbGxlY3RpdmVseSxcbiAqIFwiUHJvZHVjdHNcIiksIHByb3ZpZGVkIHRoYXQgZWFjaCB1c2VyIG9mIHRoZSBQcm9kdWN0cyBtdXN0IG9idGFpbiB0aGVpciBvd25cbiAqIFNwaW5lIEVkaXRvciBsaWNlbnNlIGFuZCByZWRpc3RyaWJ1dGlvbiBvZiB0aGUgUHJvZHVjdHMgaW4gYW55IGZvcm0gbXVzdFxuICogaW5jbHVkZSB0aGlzIGxpY2Vuc2UgYW5kIGNvcHlyaWdodCBub3RpY2UuXG4gKlxuICogVEhFIFNQSU5FIFJVTlRJTUVTIEFSRSBQUk9WSURFRCBCWSBFU09URVJJQyBTT0ZUV0FSRSBMTEMgXCJBUyBJU1wiIEFORCBBTllcbiAqIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEVTT1RFUklDIFNPRlRXQVJFIExMQyBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUyxcbiAqIEJVU0lORVNTIElOVEVSUlVQVElPTiwgT1IgTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFMpIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRlxuICogVEhFIFNQSU5FIFJVTlRJTUVTLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5pbXBvcnQgJy4vcmVxdWlyZS1zaGltLmpzJzsgLy8gU2lkZSBlZmZlY3RzIGFkZCByZXF1aXJlIHBpeGkuanMgdG8gZ2xvYmFsIHNjb3BlXG5pbXBvcnQgJy4vYXNzZXRzL2F0bGFzTG9hZGVyLmpzJzsgLy8gU2lkZSBlZmZlY3RzIGluc3RhbGwgdGhlIGxvYWRlcnMgaW50byBwaXhpXG5pbXBvcnQgJy4vYXNzZXRzL3NrZWxldG9uTG9hZGVyLmpzJzsgLy8gU2lkZSBlZmZlY3RzIGluc3RhbGwgdGhlIGxvYWRlcnMgaW50byBwaXhpXG5pbXBvcnQgJy4vZGFya3RpbnQvRGFya1RpbnRCYXRjaGVyLmpzJzsgLy8gU2lkZSBlZmZlY3RzIGluc3RhbGwgdGhlIGJhdGNoZXIgaW50byBwaXhpXG5pbXBvcnQgJy4vU3BpbmVQaXBlLmpzJztcblxuZXhwb3J0ICogZnJvbSAnLi9hc3NldHMvYXRsYXNMb2FkZXIuanMnO1xuZXhwb3J0ICogZnJvbSAnLi9hc3NldHMvc2tlbGV0b25Mb2FkZXIuanMnO1xuZXhwb3J0ICogZnJvbSAnLi9yZXF1aXJlLXNoaW0uanMnO1xuZXhwb3J0ICogZnJvbSAnLi9TcGluZS5qcyc7XG5leHBvcnQgKiBmcm9tICcuL1NwaW5lRGVidWdSZW5kZXJlci5qcyc7XG5leHBvcnQgKiBmcm9tICcuL1NwaW5lUGlwZS5qcyc7XG5leHBvcnQgKiBmcm9tICcuL1NwaW5lVGV4dHVyZS5qcyc7XG5leHBvcnQgKiBmcm9tICdAZXNvdGVyaWNzb2Z0d2FyZS9zcGluZS1jb3JlJztcbiJdfQ==