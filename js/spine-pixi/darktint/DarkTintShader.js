import { colorBit, colorBitGl, compileHighShaderGlProgram, compileHighShaderGpuProgram, generateTextureBatchBit, generateTextureBatchBitGl, getBatchSamplersUniformGroup, roundPixelsBit, roundPixelsBitGl, Shader } from 'pixi.js';
import { darkTintBit, darkTintBitGl } from './darkTintBit.js';
export class DarkTintShader extends Shader {
    constructor(maxTextures) {
        const glProgram = compileHighShaderGlProgram({
            name: 'dark-tint-batch',
            bits: [
                colorBitGl,
                darkTintBitGl,
                generateTextureBatchBitGl(maxTextures),
                roundPixelsBitGl,
            ]
        });
        const gpuProgram = compileHighShaderGpuProgram({
            name: 'dark-tint-batch',
            bits: [
                colorBit,
                darkTintBit,
                generateTextureBatchBit(maxTextures),
                roundPixelsBit,
            ]
        });
        super({
            glProgram,
            gpuProgram,
            resources: {
                batchSamplers: getBatchSamplersUniformGroup(maxTextures),
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGFya1RpbnRTaGFkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZGFya3RpbnQvRGFya1RpbnRTaGFkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUNOLFFBQVEsRUFDUixVQUFVLEVBQ1YsMEJBQTBCLEVBQzFCLDJCQUEyQixFQUMzQix1QkFBdUIsRUFDdkIseUJBQXlCLEVBQ3pCLDRCQUE0QixFQUM1QixjQUFjLEVBQ2QsZ0JBQWdCLEVBQ2hCLE1BQU0sRUFDTixNQUFNLFNBQVMsQ0FBQztBQUNqQixPQUFPLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUUzRCxNQUFNLE9BQU8sY0FBZSxTQUFRLE1BQU07SUFDekMsWUFBYSxXQUFtQjtRQUMvQixNQUFNLFNBQVMsR0FBRywwQkFBMEIsQ0FBQztZQUM1QyxJQUFJLEVBQUUsaUJBQWlCO1lBQ3ZCLElBQUksRUFBRTtnQkFDTCxVQUFVO2dCQUNWLGFBQWE7Z0JBQ2IseUJBQXlCLENBQUMsV0FBVyxDQUFDO2dCQUN0QyxnQkFBZ0I7YUFDaEI7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLFVBQVUsR0FBRywyQkFBMkIsQ0FBQztZQUM5QyxJQUFJLEVBQUUsaUJBQWlCO1lBQ3ZCLElBQUksRUFBRTtnQkFDTCxRQUFRO2dCQUNSLFdBQVc7Z0JBQ1gsdUJBQXVCLENBQUMsV0FBVyxDQUFDO2dCQUNwQyxjQUFjO2FBQ2Q7U0FDRCxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUM7WUFDTCxTQUFTO1lBQ1QsVUFBVTtZQUNWLFNBQVMsRUFBRTtnQkFDVixhQUFhLEVBQUUsNEJBQTRCLENBQUMsV0FBVyxDQUFDO2FBQ3hEO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcblx0Y29sb3JCaXQsXG5cdGNvbG9yQml0R2wsXG5cdGNvbXBpbGVIaWdoU2hhZGVyR2xQcm9ncmFtLFxuXHRjb21waWxlSGlnaFNoYWRlckdwdVByb2dyYW0sXG5cdGdlbmVyYXRlVGV4dHVyZUJhdGNoQml0LFxuXHRnZW5lcmF0ZVRleHR1cmVCYXRjaEJpdEdsLFxuXHRnZXRCYXRjaFNhbXBsZXJzVW5pZm9ybUdyb3VwLFxuXHRyb3VuZFBpeGVsc0JpdCxcblx0cm91bmRQaXhlbHNCaXRHbCxcblx0U2hhZGVyXG59IGZyb20gJ3BpeGkuanMnO1xuaW1wb3J0IHsgZGFya1RpbnRCaXQsIGRhcmtUaW50Qml0R2wgfSBmcm9tICcuL2RhcmtUaW50Qml0JztcblxuZXhwb3J0IGNsYXNzIERhcmtUaW50U2hhZGVyIGV4dGVuZHMgU2hhZGVyIHtcblx0Y29uc3RydWN0b3IgKG1heFRleHR1cmVzOiBudW1iZXIpIHtcblx0XHRjb25zdCBnbFByb2dyYW0gPSBjb21waWxlSGlnaFNoYWRlckdsUHJvZ3JhbSh7XG5cdFx0XHRuYW1lOiAnZGFyay10aW50LWJhdGNoJyxcblx0XHRcdGJpdHM6IFtcblx0XHRcdFx0Y29sb3JCaXRHbCxcblx0XHRcdFx0ZGFya1RpbnRCaXRHbCxcblx0XHRcdFx0Z2VuZXJhdGVUZXh0dXJlQmF0Y2hCaXRHbChtYXhUZXh0dXJlcyksXG5cdFx0XHRcdHJvdW5kUGl4ZWxzQml0R2wsXG5cdFx0XHRdXG5cdFx0fSk7XG5cblx0XHRjb25zdCBncHVQcm9ncmFtID0gY29tcGlsZUhpZ2hTaGFkZXJHcHVQcm9ncmFtKHtcblx0XHRcdG5hbWU6ICdkYXJrLXRpbnQtYmF0Y2gnLFxuXHRcdFx0Yml0czogW1xuXHRcdFx0XHRjb2xvckJpdCxcblx0XHRcdFx0ZGFya1RpbnRCaXQsXG5cdFx0XHRcdGdlbmVyYXRlVGV4dHVyZUJhdGNoQml0KG1heFRleHR1cmVzKSxcblx0XHRcdFx0cm91bmRQaXhlbHNCaXQsXG5cdFx0XHRdXG5cdFx0fSk7XG5cblx0XHRzdXBlcih7XG5cdFx0XHRnbFByb2dyYW0sXG5cdFx0XHRncHVQcm9ncmFtLFxuXHRcdFx0cmVzb3VyY2VzOiB7XG5cdFx0XHRcdGJhdGNoU2FtcGxlcnM6IGdldEJhdGNoU2FtcGxlcnNVbmlmb3JtR3JvdXAobWF4VGV4dHVyZXMpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG4iXX0=