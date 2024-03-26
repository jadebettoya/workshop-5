import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";
import { delay } from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let currentState: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: isFaulty ? null : false,
    k: isFaulty ? null : 1,
  };

  let proposalStore: Map<number, Value[]> = new Map();
  let voteStore: Map<number, Value[]> = new Map();

  function toSendMessage(k: number, x: Value, messageType: string) {
    for (let i = 0; i < N; i++) {
      fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: k, x: x, messageType: messageType })
      });
    }
  }

  function toHandleReceivedProposal(k: number, x: Value) {
    if (!proposalStore.has(k)) {
      proposalStore.set(k, []);
    }
  
    proposalStore.get(k)!.push(x);
  
    const proposalArray = proposalStore.get(k)!;
    const totalProposals = proposalArray.length;
    const count0 = proposalArray.filter((el) => el === 0).length;
    const count1 = totalProposals - count0;
  
    if (totalProposals >= N - F) {
      const consensus = count0 > N / 2 ? 0 : count1 > N / 2 ? 1 : "?";
      toSendMessage(k, consensus, "vote");
    }
  }

  function toHandleReceivedVote(k: number, x: Value) {
    if (!voteStore.has(k)) {
      voteStore.set(k, []);
    }
  
    voteStore.get(k)!.push(x);
  
    const votesArray = voteStore.get(k)!;
    const totalVotes = votesArray.length;
    const count0 = votesArray.filter((el) => el === 0).length;
    const count1 = totalVotes - count0;
  
    if (totalVotes >= N - F) {
      if (count0 >= F + 1 || count1 >= F + 1) {
        currentState.x = count0 > count1 ? 0 : 1;
        currentState.decided = true;
      } else {
        currentState.x =
          count0 === count1
            ? Math.random() > 0.5
              ? 0
              : 1
            : count0 > count1
            ? 0
            : 1;
            currentState.k = k + 1;
  
        toSendMessage(currentState.k, currentState.x, "propose");
      }
    }
  }
  
  


  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message", async (req, res) => {
    if (isFaulty || currentState.killed) {
      res.status(400).send("Node is faulty or killed");
      return;
    }
  
    const { k, x, messageType } = req.body;
  
    if (messageType === "propose") {
      toHandleReceivedProposal(k, x);
    } else {
      toHandleReceivedVote(k, x);
    }
  
    res.status(200).send("Message received and processed.");
  });
  

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(100);
    }
  
    if (!isFaulty) {
      toSendMessage(currentState.k ? 1 : 0, currentState.x ? initialValue : 0, "propose");
      res.status(200).send("Node started.");
    } else {
      res.status(500).send("The node is faulty.");
    }
  });
  

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    currentState.killed = true;
    currentState.x = null;
    currentState.decided = null;
    currentState.k = 0;
    res.send("The node is stopped.");
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    res.json(currentState);
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
