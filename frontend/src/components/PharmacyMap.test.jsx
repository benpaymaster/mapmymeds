import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

  global.fetch.mockClear();
  delete global.fetch;
});

