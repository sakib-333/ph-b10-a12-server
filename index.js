const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://ph-b10-a12.web.app",
      "https://ph-b10-a12.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(cookieParser());

const port = process.env.PORT || 3000;

const db_username = process.env.DB_USERNAME;
const db_password = process.env.DB_PASSWORD;

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.ph_b10_a12;

  if (!token) {
    return res.status(403).send({ message: "Unauthorized access" });
  } else {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).send({ message: "Unauthorized access" });
      }
      req.decodedEmail = decoded.email;
      next();
    });
  }
};

const checkVaildUser = (req, res, next) => {
  const { email } = req.body;

  if (email !== req.decodedEmail) {
    return res.status(403).send({ message: "Unauthorized access" });
  }
  next();
};

const uri = `mongodb+srv://${db_username}:${db_password}@cluster0.ashqk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyAdmin = async (req, res, next) => {
  try {
    const usersCollection = client.db("ph_b10_a12").collection("users");
    const { email } = req.body;

    const result = await usersCollection.findOne({ email }, {});

    if (result.userType !== "admin") {
      res.send({ status: "Error" });
    }
    next();
  } catch (err) {
    // res.send({ status: "Error" });
    console.log(err);
  }
};

async function run() {
  try {
    const usersCollection = client.db("ph_b10_a12").collection("users");
    const notificationCollection = client
      .db("ph_b10_a12")
      .collection("notifications");
    const biodataCounter = client.db("ph_b10_a12").collection("biodataCounter");
    const biodatasCollection = client.db("ph_b10_a12").collection("biodatas");
    const revenueCollection = client.db("ph_b10_a12").collection("revenue");
    const favouritesCollection = client
      .db("ph_b10_a12")
      .collection("favouritesBiodata");
    // Auth APIs
    app.post("/jwt", (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.cookie("ph_b10_a12", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      });
      res.send({ acknowledgement: true, status: "cookie created" });
    });

    // Logout
    app.post("/logout", (req, res) => {
      res.clearCookie("ph_b10_a12", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      });
      res.send({ acknowledgement: true, status: "cookie cleared" });
    });

    //Store user info start
    app.post("/saveUserInfo", async (req, res) => {
      const query = { email: req?.body?.email };
      const user = await usersCollection.findOne(query, {});

      if (!user) {
        const doc = {
          email: req?.body?.email,
          name: req.body.name,
          userType: req.body?.userType,
        };
        const result = await usersCollection.insertOne(doc);
        res.send(result);
      }
      res.send({ acknowledged: false, status: "user already exist." });
    });
    //Store user info end

    // Get primium users start
    app.get("/getPremiumUsers", async (req, res) => {
      const query = { userType: "premium" };
      const options = {
        sort: {
          age: req?.query?.age === "ascending" ? 1 : -1,
        },
      };

      const cursor = biodatasCollection.find(query, options).limit(6);
      const result = await cursor.toArray();

      res.send(result);
    });
    // Get primium users end

    // Get total biodatas start
    app.get("/totalBiodatas", async (req, res) => {
      const girlsBiodata = await biodatasCollection.countDocuments({
        bioType: "Female",
      });
      const boysBiodata = await biodatasCollection.countDocuments({
        bioType: "Male",
      });

      res.send({ girlsBiodata, boysBiodata, completedMarriages: 0 });
    });
    // Get total biodatas end

    // Get all users start
    app.post("/allBiodatas", async (req, res) => {
      const data = req?.body;
      const query = {};
      const start = Number(data?.start) || 0;

      try {
        if (data?.age) {
          const ageRange = data.age.split("-");
          query.age = {
            $gte: Number(ageRange[0]),
            $lte: Number(ageRange[1]) || 100,
          };
        }
        if (req?.body?.bioType) {
          query.bioType = req.body.bioType;
        }
        if (req?.body?.permanentDivision) {
          query.permanentDivision = req.body.permanentDivision;
        }

        const cursor = biodatasCollection.find(query, {}).skip(start).limit(20);
        const result = await cursor.toArray();

        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });
    // Get all users end

    // Get single biodata start
    app.post("/biodata", verifyToken, checkVaildUser, async (req, res) => {
      try {
        const { email } = req?.body;
        const { id } = req?.body;
        const user = await usersCollection.findOne({ email });
        const biodata = await biodatasCollection.findOne({
          _id: new ObjectId(id),
        });

        if (user.userType !== "premium") {
          biodata.contactEmail = null;
          biodata.mobileNumber = null;
        }

        res.send(biodata);
      } catch {
        res.send({ status: "error" });
      }
    });
    // Get single biodata end

    // Get 3 suggested biodata start
    app.get("/suggestedBiodatas", async (req, res) => {
      const query = req?.query;
      try {
        const result = await biodatasCollection.find(query).limit(3).toArray();
        res.send(result);
      } catch {
        res.send({ status: "error" });
      }
    });
    // Get 3 suggested biodata end

    // Add to favourites biodata start
    app.post(
      "/addToFavouritesBiodata",
      verifyToken,
      checkVaildUser,
      async (req, res) => {
        try {
          const { email, id } = req.body;
          const filter = { email };
          const options = { upsert: true };
          const updateDoc = {
            $addToSet: {
              favBios: id,
            },
          };

          const result = await favouritesCollection.updateOne(
            filter,
            updateDoc,
            options
          );

          res.send(result);
        } catch {
          res.send({ status: "Error" });
        }
      }
    );
    // Add to favourites biodata end

    // Get user type start
    app.post("/getUserType", verifyToken, checkVaildUser, async (req, res) => {
      const { email } = req?.body;

      const result = await usersCollection.findOne({ email });

      res.send(result);
    });
    // Get user type end

    // My biodata start
    app.post("/myBiodata", verifyToken, checkVaildUser, async (req, res) => {
      try {
        const { email, action } = req?.body;
        if (action === "get") {
          const user = await biodatasCollection.findOne(
            { contactEmail: email },
            {}
          );
          res.send(user);
        } else if (action === "update") {
          const { data } = req?.body;

          const filter = { contactEmail: email };
          const options = { upsert: true };
          const updateDoc = {
            $set: data,
          };
          const result = await biodatasCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send(result);
        } else if (action === "add") {
          const { data } = req?.body;
          const query = { _id: new ObjectId("678f28da768b15763583aea4") };
          const options = {
            projection: { _id: 0, BiodataId: 1 },
          };

          const resCnt = await biodataCounter.findOne(query, options);
          data.BiodataId = resCnt.BiodataId++;
          const result = await biodatasCollection.insertOne(data);

          const filter = { _id: new ObjectId("678f28da768b15763583aea4") };
          const UpsertOpt = { upsert: true };
          const updateDoc = {
            $set: {
              BiodataId: resCnt.BiodataId,
            },
          };
          await biodataCounter.updateOne(filter, updateDoc, UpsertOpt);

          res.send(result);
        }
      } catch {
        res.send({ status: "Error" });
      }
    });
    // My biodata end

    // Get my biodata start
    app.post("/getMyBiodata", verifyToken, checkVaildUser, async (req, res) => {
      try {
        const { email } = req.body;
        const myBiodata = await biodatasCollection.findOne({
          contactEmail: email,
        });
        res.send(myBiodata);
      } catch {
        res.send({ status: "Error" });
      }
    });
    // Get my biodata end
    // Request for premium start
    app.post(
      "/requestForPremium",
      verifyToken,
      checkVaildUser,
      async (req, res) => {
        try {
          const { email } = req.body;
          const filter = { _id: new ObjectId("678f6d2a768b15763583aea7") };
          const options = { upsert: true };
          const updateDoc = {
            $push: {
              premiumReq: email,
            },
          };
          const result = await notificationCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send(result);
        } catch {
          res.send({ status: "Error" });
        }
      }
    );
    // Request for premium end
    // My favourite biodatas start
    app.post(
      "/getMyFavBiodatas",
      verifyToken,
      checkVaildUser,
      async (req, res) => {
        try {
          const { email } = req.body;
          const query = { email };
          const options = {
            projection: { _id: 0, favBios: 1 },
          };
          const result = await favouritesCollection.findOne(query, options);
          const { favBios } = result;
          const favBioId = favBios.map((id) => new ObjectId(id));

          const documents = await biodatasCollection
            .find(
              { _id: { $in: favBioId } },
              {
                projection: {
                  name: 1,
                  BiodataId: 1,
                  permanentDivision: 1,
                  occupation: 1,
                },
              }
            )
            .toArray();

          res.send(documents);
        } catch (err) {
          // res.send({ status: "Error" });
          console.log(err);
        }
      }
    );
    // My favourite biodatas end

    // Count total, male, female and revenue start
    app.post(
      "/countBiodatas",
      verifyToken,
      checkVaildUser,
      verifyAdmin,
      async (req, res) => {
        try {
          const totalBios = await biodatasCollection.estimatedDocumentCount();
          const totalMaleBios = await biodatasCollection.countDocuments({
            bioType: "Male",
          });
          const totalFemaleBios = await biodatasCollection.countDocuments({
            bioType: "Female",
          });
          const totalPremiumBios = await biodatasCollection.countDocuments({
            userType: "premium",
          });
          const result = await revenueCollection.findOne(
            {
              _id: new ObjectId("6790cabf6c4e32691d08342d"),
            },
            { projection: { _id: 0, totalRevenue: 1 } }
          );

          res.send({
            totalBios,
            totalMaleBios,
            totalFemaleBios,
            totalPremiumBios,
            totalRevenue: result.totalRevenue,
          });
        } catch {
          res.send({ status: "Error" });
        }
      }
    );
    // Count total, male, female and revenue end

    // Get all users start
    app.post(
      "/getAllUsers",
      verifyToken,
      checkVaildUser,
      verifyAdmin,
      async (req, res) => {
        try {
          const { key } = req.body;
          const query = { name: { $regex: key, $options: "i" } };
          const cursor = usersCollection.find(query);
          const result = await cursor.toArray();
          res.send(result);
        } catch {
          res.send({ status: "Error" });
        }
      }
    );
    // Get all users end

    // Make admin start
    app.post(
      "/makeAdmin",
      verifyToken,
      checkVaildUser,
      verifyAdmin,
      async (req, res) => {
        try {
          const { email, adminEmail } = req?.body;
          const filter = { email: adminEmail };
          const options = { upsert: true };
          const updateDoc = {
            $set: {
              userType: "admin",
            },
          };
          const result = await usersCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send(result);
        } catch {
          res.send({ status: "Error" });
        }
      }
    );
    // Make admin end
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("<h1>Welcome</h1>");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
