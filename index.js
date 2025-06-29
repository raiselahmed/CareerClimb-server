const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
var jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//midleware
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

//middlware  verifyed
const logger = (req, res, next) => {
  console.log("loger raisel");
  next();
};

const verifyeToken = (req, res, next) => {
  console.log("first verifyed this ", req.cookies);
  const token = req?.cookies?.token;
  console.log(token);
  if (!token) {
    return res.send(401).send({ message: "Unathorized access" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.send(401).send({ message: "Unathorized access" });
    }
    req.user = decoded;
    console.log("Token successfully decoded for user:", req.user.email);
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gsishgc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Database and Collections
    const jobstCollection = client.db("CareerClimb").collection("jobs");
    const jobApplicatioCollection = client
      .db("CareerClimb")
      .collection("application");

    // Auth related APIs
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "10d" });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false, //https true for production
        })
        .send({ success: true });
    });

    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: false,
        })
        .send({ success: true });
    });

    //job related apis
    app.get("/jobs", logger, async (req, res) => {
      console.log("now ahmed apis callback");
      
      let query = {};
      let sortQuery = {};
      let search = req.query?.search;
      const min = req.query?.min;
      const max = req.query?.max;
      const { email, sort } = req.query; // Destructure query parameters
      console.log(req.query);
      // Filter by HR email if provided
      if (email) {
        query = { hr_email: email };
      }
      // Sort by salary if `sort` is true
      if (sort === "true") {
        sortQuery = { "salaryRange.min": -1 }; // Descending order by salary
      }

      //search query
      if (search) {
        query.location= {
          $regex : search, $options : 'i'
        }
      }
      // price renge
      if (min && max) {
        query = {
          ...query,
          "salaryRange.min" : {gte : parseInt(min)},
          "salaryRange.max" : {lte : parseInt(max)}
        }
      }
      console.log(query);

      // Query the collection with the query and sort options
      const cursor = jobstCollection.find(query).sort(sortQuery);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;

      const result = await jobstCollection.insertOne(newJob);
      res.send(result);
    });

    app.get("/job-application", verifyeToken, async (req, res) => {
      console.log("if vrifyd success, els no access ");

      const email = req.query.email;
      const query = { applicant_email: email };

      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await jobApplicatioCollection.find(query).toArray();

      // console.log('shawa shawa cookies', req.cookies);

      // fokira way to agregate data
      for (const application of result) {
        // console.log(application.job_id);
        const quary1 = { _id: new ObjectId(application.job_id) };
        const job = await jobstCollection.findOne(quary1);
        if (job) {
          application.title = job.title;
          application.company = job.company;
          application.company_logo = job.company_logo;
          application.category = job.category;
          application.location = job.location;
          application.jobType = job.jobType;
        }
      }
      res.send(result);
    });

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const result = await jobstCollection.findOne(quary);
      res.send(result);
    });

    // job_Application APIs
    app.get("/job-application/jobs/:job_id", async (req, res) => {
      const jobId = req.params.job_id;

      const query = { "job_id.id": jobId };
      const result = await jobApplicatioCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/job-application/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: data.status,
        },
      };
      const result = await jobApplicatioCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/job-application", async (req, res) => {
      const application = req.body;
      const result = await jobApplicatioCollection.insertOne(application);

      // Not the best way (use aggregate)
      // skip --> it
      const id = application.job_id;
      const query = { _id: new ObjectId(id) };
      const job = await jobstCollection.findOne(query);
      let newCount = 0;
      if (job.applicationCount) {
        newCount = job.applicationCount + 1;
      } else {
        newCount = 1;
      }

      // now update the job info
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          applicationCount: newCount,
        },
      };

      const updateResult = await jobstCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//default rote
app.get("/", (req, res) => {
  res.send(" CareerClimb-server is Runing ");
});
app.listen(port, () => {
  console.log(` CareerClimb-server  is runnig on port ${port}`);
});
