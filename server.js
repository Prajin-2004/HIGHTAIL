const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const nodemailer = require("nodemailer");


// Middleware
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, "public")));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/thelasthope', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// User Schema
const userSchema = new mongoose.Schema({
    role: String,
    name: String,
    about: String,
    email: String,
    password: String,
    address: String,
    profilePic: String,
    dob: String,
    qualification: String,
    age: Number,
    resume: String,
    startDate: String,
    
});

const User = mongoose.model('User', userSchema);



// Middleware to verify token
const verifyToken = async (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
        const verified = jwt.verify(token.replace('Bearer ', ''), 'your_secret_key');
        const user = await User.findById(verified.id).select('name email resume'); // Fetch user details

        if (!user) return res.status(404).json({ error: 'User not found' });

        req.user = user; // Attach full user details
        next();
    } catch (err) {
        res.status(400).json({ error: 'Invalid token' });
    }
};


// Registration Route
app.post('/register', upload.fields([{ name: 'profilePic' }, { name: 'resume' }]), async (req, res) => {
    try {
        const { role, name, about, email, password, address, dob, qualification, age, startDate } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            role,
            name,
            about,
            email,
            password: hashedPassword,
            address,
            profilePic: req.files['profilePic'] ? req.files['profilePic'][0].filename : '',
            dob: role === 'user' ? dob : '',
            qualification: role === 'user' ? qualification : '',
            age: role === 'user' ? age : null,
            resume: req.files['resume'] ? req.files['resume'][0].filename : '',
            startDate: role === 'admin' ? startDate : ''
        });

        await newUser.save();
        res.status(201).json({ message: 'Registration successful' });
    } catch (err) {
        res.status(500).json({ error: 'Registration failed', details: err.message });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1d' });

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                name: user.name,
                email: user.email,
                resume: user.resume,
                qualification: user.qualification
            }
        });

    } catch (err) {
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});


// Profile Route
app.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching profile', details: err.message });
    }
});

// Edit Profile Route
app.put('/profile/edit', verifyToken, upload.fields([{ name: 'profilePic' }, { name: 'resume' }]), async (req, res) => {
    try {
        const updates = req.body;
        if (req.files['profilePic']) updates.profilePic = req.files['profilePic'][0].filename;
        if (req.files['resume']) updates.resume = req.files['resume'][0].filename;

        const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
        res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (err) {
        res.status(500).json({ error: 'Error updating profile', details: err.message });
    }
});


// Job Post Schema
const jobSchema = new mongoose.Schema({
    companyName: String,
    jobTitle: String,
    jobDescription: String,
    qualifications: String,
    location: String,
    salary: String,
    jobImage: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    applications: [{ type: mongoose.Schema.Types.ObjectId, ref: "Apply" }], // Store applied users
    createdAt: { type: Date, default: Date.now }
});


const Job = mongoose.model('Job', jobSchema);

const applySchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    email: String,
    resume: String,
    appliedAt: { type: Date, default: Date.now }
});
const Apply = mongoose.model("Apply", applySchema);

const chatSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model("Chat", chatSchema);

// Backend: Add a schema for saved jobs
const saveSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    savedAt: { type: Date, default: Date.now }
});
const SavedJob = mongoose.model("SavedJob", saveSchema);

const token = jwt.sign(
    { id: "req.user.id", name: "req.user.name", email: "req.user.email", resume: "req.user.resume" },
    "your_secret_key",
    { expiresIn: "7d" }
);

// Add Job Post Route
app.post('/add-job', verifyToken, upload.single('jobImage'), async (req, res) => {
    try {
        const { companyName, jobTitle, jobDescription, qualifications, location, salary } = req.body;
        
        const newJob = new Job({
            companyName,
            jobTitle,
            jobDescription,
            qualifications,
            location,
            salary,
            jobImage: req.file ? req.file.filename : '',
            postedBy: req.user.id
        });

        await newJob.save();
        res.status(201).json({ message: 'Job post added successfully', job: newJob });
    } catch (err) {
        res.status(500).json({ error: 'Error adding job post', details: err.message });
    }
});

app.get('/my-jobs', verifyToken, async (req, res) => {
    try {
        const jobs = await Job.find({ postedBy: req.user.id });
        res.json(jobs);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching job posts', details: err.message });
    }
});

app.delete('/delete-job/:id', verifyToken, async (req, res) => {
    try {
        const job = await Job.findOneAndDelete({ _id: req.params.id, postedBy: req.user.id });

        if (!job) {
            return res.status(404).json({ error: 'Job not found or not authorized to delete' });
        }

        res.json({ message: 'Job deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting job post', details: err.message });
    }
});

app.get('/view-jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.status(200).json(jobs);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching job posts', details: err.message });
    }
});

app.post("/apply-job", verifyToken,  upload.single("resume"), async (req, res) => {
    try {
        const { jobId } = req.body;

        const job = await Job.findById(jobId).populate("postedBy", "email");
        if (!job) return res.status(404).json({ error: "Job not found" });

        // Prevent duplicate applications
        const existingApplication = await Apply.findOne({ jobId, userId: req.user.id });
        if (existingApplication) {
            return res.status(400).json({ error: "You have already applied for this job" });
        }

        const newApplication = new Apply({
            jobId,
            userId: req.user.id,
            name: req.user.name,
            email: req.user.email,
            resume: req.user.resume, // Ensure this is the correct file path
            jobTitle: job.jobTitle,
            companyName: job.companyName,
            qualification: job.qualifications,
            jobDescription: job.jobDescription,
            jobImage: job.jobImage
        });

        await newApplication.save();

        // Push application to the Job's applications array
        job.applications.push(newApplication._id);
        await job.save();

        // Send email to the employer
        const transporter = nodemailer.createTransport({
            service: "email",
            auth: {
                user: "haightailjobseeker@gmail.com",
                pass: "haag amdi coqz wnai"
            }
        });

        // Generate a downloadable link for the resume
        const resumeUrl = `http://localhost:4000/uploads/${req.user.resume}`; // Adjust this based on your server

        const mailOptions = {
            from: "haightailjobseeker@gmail.com",
            to: job.postedBy.email,
            subject: `New Job Application for ${job.jobTitle}`,
            html: `
                <h3>New Job Application</h3>
                <p><b>Name:</b> ${req.user.name}</p>
                <p><b>Email:</b> ${req.user.email}</p>
                <p><b>Resume:</b> <a href="${resumeUrl}" download>Download Resume (PDF/DOC)</a></p>
                <p><b>Applied for:</b> ${job.jobTitle} at ${job.companyName}</p>
                <p><b>Job Description:</b> ${job.jobDescription}</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ message: "Applied successfully and email sent to the employer" });
    } catch (err) {
        res.status(500).json({ error: "Error applying for job", details: err.message });
    }
});


app.get("/view-applied-jobs", verifyToken, async (req, res) => {
    try {
        const userAppliedJobs = await Apply.find({ userId: req.user.id }).populate({
            path: "jobId",
            select: "jobTitle companyName qualification jobDescription jobImage"
        });

        if (!userAppliedJobs.length) {
            return res.status(404).json({ message: "No applied jobs found." });
        }

        // Formatting response to avoid undefined values
        const formattedJobs = userAppliedJobs.map(application => ({
            jobId: application.jobId?._id || "N/A",
            jobTitle: application.jobId?.jobTitle || "N/A",
            companyName: application.jobId?.companyName || "N/A",
            qualification: application.jobId?.qualification || "N/A",
            jobDescription: application.jobId?.jobDescription || "N/A",
            jobImage: application.jobId?.jobImage || "default.jpg",
            appliedAt: application.appliedAt || "Unknown",
            name: application.name || "N/A",
            email: application.email || "N/A",
            resume: application.resume || "N/A"
        }));

        res.json(formattedJobs);
    } catch (err) {
        res.status(500).json({ error: "Error fetching applied jobs", details: err.message });
    }
});

app.delete("/remove-applied-job", verifyToken, async (req, res) => {
    try {
        const { jobId } = req.body;

        const deletedApplication = await Apply.findOneAndDelete({ jobId, userId: req.user.id });

        if (!deletedApplication) {
            return res.status(404).json({ error: "Job application not found or already removed." });
        }

        res.json({ message: "Job application removed successfully." });
    } catch (err) {
        res.status(500).json({ error: "Error removing job application", details: err.message });
    }
});


// Save a job post
app.post("/save-job", verifyToken, async (req, res) => {
    try {
        const { jobId } = req.body;
        const existingSave = await SavedJob.findOne({ jobId, userId: req.user.id });
        if (existingSave) {
            return res.status(400).json({ error: "Job already saved." });
        }
        
        const newSavedJob = new SavedJob({ jobId, userId: req.user.id });
        await newSavedJob.save();
        res.json({ message: "Job saved successfully." });
    } catch (err) {
        res.status(500).json({ error: "Error saving job", details: err.message });
    }
});

// Fetch saved jobs for the logged-in user
app.get("/view-saved-jobs", verifyToken, async (req, res) => {
    try {
        const savedJobs = await SavedJob.find({ userId: req.user.id }).populate({
            path: "jobId",
            select: "jobTitle companyName jobDescription jobImage location salary"
        });
        
        if (!savedJobs.length) {
            return res.status(404).json({ message: "No saved jobs found." });
        }
        
        res.json(savedJobs.map(job => ({
            jobId: job.jobId?._id || "N/A",
            jobTitle: job.jobId?.jobTitle || "N/A",
            companyName: job.jobId?.companyName || "N/A",
            jobDescription: job.jobId?.jobDescription || "N/A",
            jobImage: job.jobId?.jobImage || "default.jpg",
            location: job.jobId?.location || "Unknown",
            salary: job.jobId?.salary || "Unknown",
            savedAt: job.savedAt || "Unknown"
        })));
    } catch (err) {
        res.status(500).json({ error: "Error fetching saved jobs", details: err.message });
    }
});

// Remove a saved job
app.delete("/remove-saved-job", verifyToken, async (req, res) => {
    try {
        const { jobId } = req.body;
        const deletedSave = await SavedJob.findOneAndDelete({ jobId, userId: req.user.id });
        if (!deletedSave) {
            return res.status(404).json({ error: "Job not found in saved list." });
        }
        res.json({ message: "Job removed from saved list." });
    } catch (err) {
        res.status(500).json({ error: "Error removing saved job", details: err.message });
    }
});

//feedback
const feedbackSchema = new mongoose.Schema({
    name: String,
    email: String,
    rating: Number,
    message: String,
    date: { type: Date, default: Date.now }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: "haightailjobseeker@gmail.com",
        pass: "haag amdi coqz wnai"       // Replace with your email password or App Password
    }
});

// Feedback Submission API
app.post('/submit-feedback', async (req, res) => {
    try {
        const { name, email, rating, message } = req.body;
        
        // Save feedback to MongoDB
        const newFeedback = new Feedback({ name, email, rating, message });
        await newFeedback.save();

        // Send Email to Admin
        const mailOptions = {
            from: 'email',
            to: 'haightailjobseeker@gmail.com', // Replace with admin email
            subject: 'New Feedback Received',
            text: `New feedback received:\n\nName: ${name}\nEmail: ${email}\nRating: ${rating}\nMessage: ${message}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email Error:', error);
            } else {
                console.log('Email Sent:', info.response);
            }
        });

        res.json({ message: 'Feedback submitted successfully!' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

app.listen(4000, () => console.log('Server running on port 4000'));