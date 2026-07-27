declare module "idiomorph" {
    type MorphConfig = {
        morphStyle?: "innerHTML" | "outerHTML";
        ignoreActive?: boolean;
        ignoreActiveValue?: boolean;
        restoreFocus?: boolean;
    };

    export const Idiomorph: {
        morph: (
            oldNode: Node,
            newContent: string | Node,
            config?: MorphConfig,
        ) => Node[];
    };
}