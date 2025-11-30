import { useState } from "react";
import "./Display.css";
const Display = ({ contract, account }) => {
  const [data, setData] = useState("");
  const getdata = async () => {
    let dataArray;
    const Otheraddress = document.querySelector(".address").value;
    try {
      if (Otheraddress) {
        dataArray = await contract.display(Otheraddress);
        console.log(dataArray);
      } else {
        dataArray = await contract.display(account);
      }
    } catch (e) {
      alert("You don't have access");
      return;
    }

    if (!dataArray || dataArray.length === 0) {
      alert("No image to display");
      return;
    }

    // Convert returned array to strings and build image elements
    const str = dataArray.toString();
    const str_array = str.split(",");
    const images = str_array.map((item, i) => {
      // Normalize storage: strip leading ipfs:// if present
      const hash = item.replace(/^ipfs:\/\//, "");
      const url = `https://gateway.pinata.cloud/ipfs/${hash}`;
      return (
        <a href={url} key={i} target="_blank" rel="noreferrer">
          <img
            key={i}
            src={url}
            alt={`img-${i}`}
            className="image-list"
          ></img>
        </a>
      );
    });
    setData(images);
  };
  return (
    <>
      <div className="image-list">{data}</div>
      <input
        type="text"
        placeholder="Enter Address"
        className="address"
      ></input>
      <button className="center button" onClick={getdata}>
        Get Data
      </button>
    </>
  );
};
export default Display;
