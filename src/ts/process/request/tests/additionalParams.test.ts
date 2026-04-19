import { describe, expect, it } from "vitest";

import { parseAdditionalParamJsonValue } from "../additionalParams";

describe("parseAdditionalParamJsonValue", () => {
    it("parses standard JSON additional parameter values", () => {
        expect(
            parseAdditionalParamJsonValue('{"enable_thinking":true,"budget_tokens":0}')
        ).toEqual({
            enable_thinking: true,
            budget_tokens: 0,
        });
    });

    it("accepts Python-style booleans and null in json:: values", () => {
        expect(
            parseAdditionalParamJsonValue(
                '{"enable_thinking": True, "nested": {"flag": False, "value": None}}'
            )
        ).toEqual({
            enable_thinking: true,
            nested: {
                flag: false,
                value: null,
            },
        });
    });

    it("does not rewrite quoted keyword strings", () => {
        expect(
            parseAdditionalParamJsonValue(
                '{"string_true": "True", "string_false": "False", "string_none": "None"}'
            )
        ).toEqual({
            string_true: "True",
            string_false: "False",
            string_none: "None",
        });
    });

    it("returns undefined for invalid json:: payloads", () => {
        expect(parseAdditionalParamJsonValue('{"enable_thinking": Truthy}')).toBeUndefined();
    });
});
