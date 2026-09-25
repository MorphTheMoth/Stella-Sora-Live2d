import { Buffer, BufferUsage, Geometry } from 'pixi.js';
const placeHolderBufferData = new Float32Array(1);
const placeHolderIndexData = new Uint32Array(1);
export class DarkTintBatchGeometry extends Geometry {
    constructor() {
        const vertexSize = 7;
        const attributeBuffer = new Buffer({
            data: placeHolderBufferData,
            label: 'attribute-batch-buffer',
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
            shrinkToFit: false,
        });
        const indexBuffer = new Buffer({
            data: placeHolderIndexData,
            label: 'index-batch-buffer',
            usage: BufferUsage.INDEX | BufferUsage.COPY_DST, // | BufferUsage.STATIC,
            shrinkToFit: false,
        });
        const stride = vertexSize * 4;
        super({
            attributes: {
                aPosition: {
                    buffer: attributeBuffer,
                    format: 'float32x2',
                    stride,
                    offset: 0,
                },
                aUV: {
                    buffer: attributeBuffer,
                    format: 'float32x2',
                    stride,
                    offset: 2 * 4,
                },
                aColor: {
                    buffer: attributeBuffer,
                    format: 'unorm8x4',
                    stride,
                    offset: 4 * 4,
                },
                aDarkColor: {
                    buffer: attributeBuffer,
                    format: 'unorm8x4',
                    stride,
                    offset: 5 * 4,
                },
                aTextureIdAndRound: {
                    buffer: attributeBuffer,
                    format: 'uint16x2',
                    stride,
                    offset: 6 * 4,
                },
            },
            indexBuffer
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGFya1RpbnRCYXRjaEdlb21ldHJ5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2Rhcmt0aW50L0RhcmtUaW50QmF0Y2hHZW9tZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFFeEQsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRCxNQUFNLG9CQUFvQixHQUFHLElBQUksV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRWhELE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxRQUFRO0lBQ2xEO1FBQ0MsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBRXJCLE1BQU0sZUFBZSxHQUFHLElBQUksTUFBTSxDQUFDO1lBQ2xDLElBQUksRUFBRSxxQkFBcUI7WUFDM0IsS0FBSyxFQUFFLHdCQUF3QjtZQUMvQixLQUFLLEVBQUUsV0FBVyxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUTtZQUNoRCxXQUFXLEVBQUUsS0FBSztTQUNsQixDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQztZQUM5QixJQUFJLEVBQUUsb0JBQW9CO1lBQzFCLEtBQUssRUFBRSxvQkFBb0I7WUFDM0IsS0FBSyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLFFBQVEsRUFBRSx3QkFBd0I7WUFDekUsV0FBVyxFQUFFLEtBQUs7U0FDbEIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsVUFBVSxHQUFHLENBQUMsQ0FBQztRQUU5QixLQUFLLENBQUM7WUFDTCxVQUFVLEVBQUU7Z0JBQ1gsU0FBUyxFQUFFO29CQUNWLE1BQU0sRUFBRSxlQUFlO29CQUN2QixNQUFNLEVBQUUsV0FBVztvQkFDbkIsTUFBTTtvQkFDTixNQUFNLEVBQUUsQ0FBQztpQkFDVDtnQkFDRCxHQUFHLEVBQUU7b0JBQ0osTUFBTSxFQUFFLGVBQWU7b0JBQ3ZCLE1BQU0sRUFBRSxXQUFXO29CQUNuQixNQUFNO29CQUNOLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQztpQkFDYjtnQkFDRCxNQUFNLEVBQUU7b0JBQ1AsTUFBTSxFQUFFLGVBQWU7b0JBQ3ZCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixNQUFNO29CQUNOLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQztpQkFDYjtnQkFDRCxVQUFVLEVBQUU7b0JBQ1gsTUFBTSxFQUFFLGVBQWU7b0JBQ3ZCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixNQUFNO29CQUNOLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQztpQkFDYjtnQkFDRCxrQkFBa0IsRUFBRTtvQkFDbkIsTUFBTSxFQUFFLGVBQWU7b0JBQ3ZCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixNQUFNO29CQUNOLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQztpQkFDYjthQUNEO1lBQ0QsV0FBVztTQUNYLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJ1ZmZlciwgQnVmZmVyVXNhZ2UsIEdlb21ldHJ5IH0gZnJvbSAncGl4aS5qcyc7XG5cbmNvbnN0IHBsYWNlSG9sZGVyQnVmZmVyRGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkoMSk7XG5jb25zdCBwbGFjZUhvbGRlckluZGV4RGF0YSA9IG5ldyBVaW50MzJBcnJheSgxKTtcblxuZXhwb3J0IGNsYXNzIERhcmtUaW50QmF0Y2hHZW9tZXRyeSBleHRlbmRzIEdlb21ldHJ5IHtcblx0Y29uc3RydWN0b3IgKCkge1xuXHRcdGNvbnN0IHZlcnRleFNpemUgPSA3O1xuXG5cdFx0Y29uc3QgYXR0cmlidXRlQnVmZmVyID0gbmV3IEJ1ZmZlcih7XG5cdFx0XHRkYXRhOiBwbGFjZUhvbGRlckJ1ZmZlckRhdGEsXG5cdFx0XHRsYWJlbDogJ2F0dHJpYnV0ZS1iYXRjaC1idWZmZXInLFxuXHRcdFx0dXNhZ2U6IEJ1ZmZlclVzYWdlLlZFUlRFWCB8IEJ1ZmZlclVzYWdlLkNPUFlfRFNULFxuXHRcdFx0c2hyaW5rVG9GaXQ6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaW5kZXhCdWZmZXIgPSBuZXcgQnVmZmVyKHtcblx0XHRcdGRhdGE6IHBsYWNlSG9sZGVySW5kZXhEYXRhLFxuXHRcdFx0bGFiZWw6ICdpbmRleC1iYXRjaC1idWZmZXInLFxuXHRcdFx0dXNhZ2U6IEJ1ZmZlclVzYWdlLklOREVYIHwgQnVmZmVyVXNhZ2UuQ09QWV9EU1QsIC8vIHwgQnVmZmVyVXNhZ2UuU1RBVElDLFxuXHRcdFx0c2hyaW5rVG9GaXQ6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RyaWRlID0gdmVydGV4U2l6ZSAqIDQ7XG5cblx0XHRzdXBlcih7XG5cdFx0XHRhdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdGFQb3NpdGlvbjoge1xuXHRcdFx0XHRcdGJ1ZmZlcjogYXR0cmlidXRlQnVmZmVyLFxuXHRcdFx0XHRcdGZvcm1hdDogJ2Zsb2F0MzJ4MicsXG5cdFx0XHRcdFx0c3RyaWRlLFxuXHRcdFx0XHRcdG9mZnNldDogMCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YVVWOiB7XG5cdFx0XHRcdFx0YnVmZmVyOiBhdHRyaWJ1dGVCdWZmZXIsXG5cdFx0XHRcdFx0Zm9ybWF0OiAnZmxvYXQzMngyJyxcblx0XHRcdFx0XHRzdHJpZGUsXG5cdFx0XHRcdFx0b2Zmc2V0OiAyICogNCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YUNvbG9yOiB7XG5cdFx0XHRcdFx0YnVmZmVyOiBhdHRyaWJ1dGVCdWZmZXIsXG5cdFx0XHRcdFx0Zm9ybWF0OiAndW5vcm04eDQnLFxuXHRcdFx0XHRcdHN0cmlkZSxcblx0XHRcdFx0XHRvZmZzZXQ6IDQgKiA0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhRGFya0NvbG9yOiB7XG5cdFx0XHRcdFx0YnVmZmVyOiBhdHRyaWJ1dGVCdWZmZXIsXG5cdFx0XHRcdFx0Zm9ybWF0OiAndW5vcm04eDQnLFxuXHRcdFx0XHRcdHN0cmlkZSxcblx0XHRcdFx0XHRvZmZzZXQ6IDUgKiA0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhVGV4dHVyZUlkQW5kUm91bmQ6IHtcblx0XHRcdFx0XHRidWZmZXI6IGF0dHJpYnV0ZUJ1ZmZlcixcblx0XHRcdFx0XHRmb3JtYXQ6ICd1aW50MTZ4MicsXG5cdFx0XHRcdFx0c3RyaWRlLFxuXHRcdFx0XHRcdG9mZnNldDogNiAqIDQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5kZXhCdWZmZXJcblx0XHR9KTtcblx0fVxufVxuXG4iXX0=