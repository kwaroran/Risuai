declare module "idiomorph" {
    type MorphCallbacks = {
        beforeNodeMorphed?: (oldNode: Node, newNode: Node) => boolean | void;
        beforeAttributeUpdated?: (
            attributeName: string,
            node: Element,
            mutationType: "update" | "remove",
        ) => boolean | void;
    };

    type MorphConfig = {
        morphStyle?: "innerHTML" | "outerHTML";
        ignoreActive?: boolean;
        ignoreActiveValue?: boolean;
        restoreFocus?: boolean;
        callbacks?: MorphCallbacks;
    };

    export const Idiomorph: {
        morph: (
            oldNode: Node,
            newContent: string | Node,
            config?: MorphConfig,
        ) => Node[];
    };
}