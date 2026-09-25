/* eslint-disable max-len */
export const darkTintBit = {
    name: 'color-bit',
    vertex: {
        header: /* wgsl */ `
            @in aDarkColor: vec4<f32>;
            @out vDarkColor: vec4<f32>;
        `,
        main: /* wgsl */ `
        vDarkColor = aDarkColor;
        `
    },
    fragment: {
        header: /* wgsl */ `
            @in vDarkColor: vec4<f32>;
        `,
        end: /* wgsl */ `

        let alpha = outColor.a * vColor.a;
        let rgb = ((outColor.a - 1.0) * vDarkColor.a + 1.0 - outColor.rgb) * vDarkColor.rgb + outColor.rgb * vColor.rgb;

        finalColor = vec4<f32>(rgb, alpha);

        `
    }
};
export const darkTintBitGl = {
    name: 'color-bit',
    vertex: {
        header: /* glsl */ `
            in vec4 aDarkColor;
            out vec4 vDarkColor;
        `,
        main: /* glsl */ `
            vDarkColor = aDarkColor;
        `
    },
    fragment: {
        header: /* glsl */ `
            in vec4 vDarkColor;
        `,
        end: /* glsl */ `

        finalColor.a = outColor.a * vColor.a;
        finalColor.rgb = ((outColor.a - 1.0) * vDarkColor.a + 1.0 - outColor.rgb) * vDarkColor.rgb + outColor.rgb * vColor.rgb;
        `
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGFya1RpbnRCaXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZGFya3RpbnQvZGFya1RpbnRCaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsNEJBQTRCO0FBQzVCLE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRztJQUMxQixJQUFJLEVBQUUsV0FBVztJQUNqQixNQUFNLEVBQUU7UUFDUCxNQUFNLEVBQUUsVUFBVSxDQUFBOzs7U0FHWDtRQUNQLElBQUksRUFBRSxVQUFVLENBQUE7O1NBRVQ7S0FDUDtJQUNELFFBQVEsRUFBRTtRQUNULE1BQU0sRUFBRSxVQUFVLENBQUE7O1NBRVg7UUFDUCxHQUFHLEVBQUUsVUFBVSxDQUFBOzs7Ozs7O1NBT1I7S0FDUDtDQUNELENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUc7SUFDNUIsSUFBSSxFQUFFLFdBQVc7SUFDakIsTUFBTSxFQUFFO1FBQ1AsTUFBTSxFQUFFLFVBQVUsQ0FBQTs7O1NBR1g7UUFDUCxJQUFJLEVBQUUsVUFBVSxDQUFBOztTQUVUO0tBQ1A7SUFDRCxRQUFRLEVBQUU7UUFDVCxNQUFNLEVBQUUsVUFBVSxDQUFBOztTQUVYO1FBQ1AsR0FBRyxFQUFFLFVBQVUsQ0FBQTs7OztTQUlSO0tBQ1A7Q0FDRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbWF4LWxlbiAqL1xuZXhwb3J0IGNvbnN0IGRhcmtUaW50Qml0ID0ge1xuXHRuYW1lOiAnY29sb3ItYml0Jyxcblx0dmVydGV4OiB7XG5cdFx0aGVhZGVyOiAvKiB3Z3NsICovYFxuICAgICAgICAgICAgQGluIGFEYXJrQ29sb3I6IHZlYzQ8ZjMyPjtcbiAgICAgICAgICAgIEBvdXQgdkRhcmtDb2xvcjogdmVjNDxmMzI+O1xuICAgICAgICBgLFxuXHRcdG1haW46IC8qIHdnc2wgKi9gXG4gICAgICAgIHZEYXJrQ29sb3IgPSBhRGFya0NvbG9yO1xuICAgICAgICBgXG5cdH0sXG5cdGZyYWdtZW50OiB7XG5cdFx0aGVhZGVyOiAvKiB3Z3NsICovYFxuICAgICAgICAgICAgQGluIHZEYXJrQ29sb3I6IHZlYzQ8ZjMyPjtcbiAgICAgICAgYCxcblx0XHRlbmQ6IC8qIHdnc2wgKi9gXG5cbiAgICAgICAgbGV0IGFscGhhID0gb3V0Q29sb3IuYSAqIHZDb2xvci5hO1xuICAgICAgICBsZXQgcmdiID0gKChvdXRDb2xvci5hIC0gMS4wKSAqIHZEYXJrQ29sb3IuYSArIDEuMCAtIG91dENvbG9yLnJnYikgKiB2RGFya0NvbG9yLnJnYiArIG91dENvbG9yLnJnYiAqIHZDb2xvci5yZ2I7XG5cbiAgICAgICAgZmluYWxDb2xvciA9IHZlYzQ8ZjMyPihyZ2IsIGFscGhhKTtcblxuICAgICAgICBgXG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBkYXJrVGludEJpdEdsID0ge1xuXHRuYW1lOiAnY29sb3ItYml0Jyxcblx0dmVydGV4OiB7XG5cdFx0aGVhZGVyOiAvKiBnbHNsICovYFxuICAgICAgICAgICAgaW4gdmVjNCBhRGFya0NvbG9yO1xuICAgICAgICAgICAgb3V0IHZlYzQgdkRhcmtDb2xvcjtcbiAgICAgICAgYCxcblx0XHRtYWluOiAvKiBnbHNsICovYFxuICAgICAgICAgICAgdkRhcmtDb2xvciA9IGFEYXJrQ29sb3I7XG4gICAgICAgIGBcblx0fSxcblx0ZnJhZ21lbnQ6IHtcblx0XHRoZWFkZXI6IC8qIGdsc2wgKi9gXG4gICAgICAgICAgICBpbiB2ZWM0IHZEYXJrQ29sb3I7XG4gICAgICAgIGAsXG5cdFx0ZW5kOiAvKiBnbHNsICovYFxuXG4gICAgICAgIGZpbmFsQ29sb3IuYSA9IG91dENvbG9yLmEgKiB2Q29sb3IuYTtcbiAgICAgICAgZmluYWxDb2xvci5yZ2IgPSAoKG91dENvbG9yLmEgLSAxLjApICogdkRhcmtDb2xvci5hICsgMS4wIC0gb3V0Q29sb3IucmdiKSAqIHZEYXJrQ29sb3IucmdiICsgb3V0Q29sb3IucmdiICogdkNvbG9yLnJnYjtcbiAgICAgICAgYFxuXHR9XG59O1xuIl19