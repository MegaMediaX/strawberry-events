// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ink, Tick, Caption, Field } from "../field";

describe("Ink", () => {
  it("is a native input", () => {
    render(<Ink aria-label="First name" />);
    expect(screen.getByLabelText("First name").tagName).toBe("INPUT");
  });

  /**
   * The wizard moves focus to the offending field when validation fails, so a
   * null ref there is a form that reports an error and then strands the person
   * on it.
   *
   * Note what this does and does not catch. On React 19 `ref` is an ordinary
   * prop, so a spread forwards it with or without an explicit destructure —
   * removing that destructure is a mutation this test survives, and it was
   * checked. What it does catch is destructuring `ref` out and then failing to
   * pass it on, which is silent in both the type checker and the runtime.
   */
  it("forwards its ref, which is what the wizard focuses on a validation error", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Ink ref={ref} aria-label="Email" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("INPUT");
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it("passes aria-invalid through, which is both the styling hook and the announcement", () => {
    render(<Ink aria-label="Email" aria-invalid={true} aria-describedby="err" />);
    const el = screen.getByLabelText("Email");
    // The CSS selector is [aria-invalid="true"], so the serialized value matters.
    expect(el.getAttribute("aria-invalid")).toBe("true");
    expect(el.getAttribute("aria-describedby")).toBe("err");
  });

  it("still types", async () => {
    const user = userEvent.setup();
    render(<Ink aria-label="Company" />);
    await user.type(screen.getByLabelText("Company"), "Acme");
    expect((screen.getByLabelText("Company") as HTMLInputElement).value).toBe("Acme");
  });
});

describe("Caption", () => {
  it("associates with its control by id, not by proximity", () => {
    render(
      <>
        <Caption htmlFor="f">Email</Caption>
        <Ink id="f" />
      </>,
    );
    // getByLabelText resolves through htmlFor/id. Every field in the wizard was
    // once announced unlabelled because these were siblings with no pair.
    expect(screen.getByLabelText("Email").tagName).toBe("INPUT");
  });
});

describe("Field", () => {
  it("labels its control", () => {
    render(
      <Field label="Job title" htmlFor="j">
        <Ink id="j" />
      </Field>,
    );
    expect(screen.getByLabelText(/Job title/).tagName).toBe("INPUT");
  });

  it("marks required decoratively, leaving the announcement to the control", () => {
    render(
      <Field label="Email" htmlFor="e" required>
        <Ink id="e" aria-required="true" />
      </Field>,
    );
    // The asterisk must not be what tells a screen reader the field is
    // required — aria-required on the control is (WCAG 3.3.2).
    expect(screen.getByLabelText(/Email/).getAttribute("aria-required")).toBe("true");
  });
});

describe("Tick", () => {
  function Harness({ onChange }: { onChange?: (v: boolean) => void }) {
    const [v, setV] = useState(false);
    return (
      <Tick
        checked={v}
        onCheckedChange={(n) => {
          setV(n);
          onChange?.(n);
        }}
      >
        I accept the terms
      </Tick>
    );
  }

  it("is a real checkbox", () => {
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: /I accept the terms/ });
    expect(box.tagName).toBe("INPUT");
    expect((box as HTMLInputElement).type).toBe("checkbox");
  });

  it("toggles with the keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const box = screen.getByRole("checkbox");
    box.focus();
    // Space is how a checkbox is operated. A div with onClick passes a click
    // test and fails here — and this one gates consent.
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(true);
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it("toggles by clicking its label", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("I accept the terms"));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("paints the box from the checked state", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const box = () => container.querySelector(".paper-tick-box");
    expect(box()?.hasAttribute("data-checked")).toBe(false);
    await user.click(screen.getByRole("checkbox"));
    expect(box()?.hasAttribute("data-checked")).toBe(true);
  });
});
