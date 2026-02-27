import { useState } from "react";

import "./styles.css";

export function NewGasRecord({ onSubmit }) {
  const [newItem, setNewItem] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDate, setNewDate] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (newDate === "" ||newItem === "" || newPrice === "") return;
    onSubmit(newDate, newItem, newPrice);
    setNewDate("");
    setNewItem("");
    setNewPrice("");
  }

  return (
    <form onSubmit={handleSubmit} className="new-item-form">
      <div className="form-row">
        <h1 className="pageHead">Gas Record</h1>
        <br />
        <label>Date: </label>
        <input
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          type="date"
          id="date"
        />
        <label>Lit: </label>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          type="number"
          id="item"
          step="0.01"
          min="0"
          max="9999.99"
        />
        <label>Price: </label>
        <input
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          type="number"
          id="price"
          step="0.01"
          min="0"
          max="9999.99"
        />
      </div>
      <button className="btn">Add</button>
    </form>
  );
}
